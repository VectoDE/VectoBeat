from __future__ import annotations

import asyncio
import re
import secrets
from types import SimpleNamespace
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple, TYPE_CHECKING

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.services.lavalink_service import LavalinkVoiceClient
from src.services.server_settings_service import QueueCapacity
from src.services.server_settings import ServerSettingsService
from src.utils.embeds import EmbedFactory
from src.utils.time import ms_to_clock
from lavalink.errors import ClientError

MSG_GUILD_ONLY = "This command can only be used inside a server."
MSG_NOT_CONNECTED = "Not connected."
MSG_NOTHING_PLAYING = "Nothing is playing."

if TYPE_CHECKING:
    from src.services.queue_copilot_service import QueueCopilotService
    from src.services.server_settings_service import ServerSettingsService
    from src.services.dj_permission_service import DJPermissionManager
    from src.services.queue_telemetry_service import QueueTelemetryService
    from src.services.profile_service import GuildProfileManager

URL_REGEX = re.compile(r"https?://", re.IGNORECASE)
VOICE_PERMISSIONS = ("connect", "speak", "view_channel")


def ms_to_clock(ms: int) -> str:
    """Convert milliseconds into a human readable duration string."""
    seconds = max(0, int(ms // 1000))
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"


class MusicControls(commands.Cog):
    """Slash commands for managing playback, volume and queue behaviour."""

    def __init__(self, bot: commands.Bot):
        from typing import cast, Any
        from src.main import VectoBeat
        self.bot: VectoBeat = cast(Any, bot)

    # ------------------------------------------------------------------ helpers
    def _telemetry(self) -> Optional[QueueTelemetryService]:
        return getattr(self.bot, "queue_telemetry", None)

    def _settings_service(self) -> Optional[ServerSettingsService]:
        return getattr(self.bot, "server_settings", None)

    def _queue_sync_service(self) -> Optional[QueueSyncService]:
        return getattr(self.bot, "queue_sync", None)

    def _shard_supervisor(self) -> Optional[ShardSupervisor]:
        return getattr(self.bot, "shard_supervisor", None)

    def _alert_service(self) -> Optional[AlertService]:
        return getattr(self.bot, "alerts", None)

    def _automation_audit_service(self) -> Optional[AutomationAuditService]:
        return getattr(self.bot, "automation_audit", None)

    def _command_throttle_service(self) -> Optional[CommandThrottleService]:
        return getattr(self.bot, "command_throttle", None)

    def _analytics_export_service(self) -> Optional[AnalyticsExportService]:
        return getattr(self.bot, "analytics_export", None)

    def _queue_copilot_service(self) -> Optional[QueueCopilotService]:
        return getattr(self.bot, "queue_copilot", None)

    async def _send_ephemeral(self, inter: discord.Interaction, embed: discord.Embed) -> None:
        """Reply ephemerally regardless of the interaction's current response state."""
        if inter.response.is_done():
            await inter.followup.send(embed=embed, ephemeral=True)
        else:
            await inter.response.send_message(embed=embed, ephemeral=True)

    async def _ensure_lavalink_available(
        self, inter: discord.Interaction, factory: EmbedFactory
    ) -> bool:
        """Make sure at least one Lavalink node is reachable before connecting."""
        manager = getattr(self.bot, "lavalink_manager", None)
        try:
            if manager:
                await manager.ensure_ready()
        except Exception as exc:  # pragma: no cover - defensive
            bot_logger = getattr(self.bot, "logger", None)
            if bot_logger:
                bot_logger.debug("Failed to ensure Lavalink readiness: %s", exc)

        client = getattr(self.bot, "lavalink", None)
        available_nodes = []
        if client and getattr(client, "node_manager", None):
            available_nodes = getattr(client.node_manager, "available_nodes", [])  # type: ignore[attr-defined]

        if available_nodes:
            return True

        message = factory.error(
            "Playback is temporarily unavailable because no Lavalink node is reachable. "
            "Please check the node configuration or try again shortly."
        )
        await self._send_ephemeral(inter, message)
        return False

    async def _publish_queue_state(
        self,
        player: Optional[lavalink.DefaultPlayer],
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        service = self._queue_sync_service()
        if service and player:
            await service.publish_state(player.guild_id, player, reason, metadata=metadata)

    async def _apply_player_region(self, guild_id: int, player: Optional[lavalink.DefaultPlayer]) -> None:
        if not player:
            return
        settings = self._settings_service()
        manager = getattr(self.bot, "lavalink_manager", None)
        if not settings or not manager:
            return
        try:
            region = await settings.lavalink_region(guild_id)
        except Exception:
            region = "auto"
        await manager.route_player(player, region)

    async def _throttle_command(self, inter: discord.Interaction, bucket: str) -> bool:
        service = self._command_throttle_service()
        if not service or not inter.guild:
            return True
        allowed, retry_after = await service.allow(inter.guild.id, bucket)
        if allowed:
            return True
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        message = factory.warning(
            "We're momentarily slowing down commands to protect this shard. "
            f"Try again in `{int(retry_after)}s`.",
        )
        if inter.response.is_done():
            await inter.followup.send(embed=message, ephemeral=True)
        else:
            await inter.response.send_message(embed=message, ephemeral=True)
        await self._record_automation_action(
            inter.guild.id,
            action="command_throttled",
            origin=bucket,
            metadata={"command": bucket, "retryAfter": float(retry_after or 0)},
            category="throttle",
        )
        return False

    async def _record_analytics(self, guild_id: int, event: str, payload: Dict[str, Any]) -> None:
        service = self._analytics_export_service()
        if service:
            await service.record_event(guild_id, event, payload)

    def _profile_manager(self) -> Optional[GuildProfileManager]:
        return getattr(self.bot, "profile_manager", None)

    async def _record_compliance(self, guild_id: int, event: str, details: Dict[str, Any]) -> None:
        service = self._alert_service()
        if service:
            await service.record_compliance(guild_id, event, details)

    async def _record_automation_action(
        self,
        guild_id: int,
        *,
        action: str,
        origin: str,
        metadata: Dict[str, Any],
        category: str = "queue",
    ) -> None:
        service = self._automation_audit_service()
        if not service:
            return
        shard_id = None
        guild = self.bot.get_guild(guild_id)
        if guild:
            shard_id = getattr(guild, "shard_id", None)
        description = self._automation_description(action, origin, metadata)
        await service.record_action(
            guild_id,
            action=action,
            category=category,
            description=description,
            metadata={**metadata, "origin": origin},
            shard_id=shard_id,
        )

    async def _notify_capacity_block(self, guild_id: int, capacity: QueueCapacity) -> None:
        service = self._alert_service()
        if service:
            message = "Queue limit reached; additional tracks were blocked."
            await service.moderator_alert(
                guild_id,
                message,
                limit=capacity.limit,
                remaining=capacity.remaining,
                tier=capacity.plan_label(),
            )

    async def _automation_mode(self, guild_id: int) -> str:
        service = self._settings_service()
        if not service:
            return "off"
        try:
            mode = await service.automation_mode(guild_id)
        except Exception:
            mode = "off"
        supervisor = self._shard_supervisor()
        if supervisor and hasattr(supervisor, "update_automation_for_guild"):
            supervisor.update_automation_for_guild(guild_id, mode)
        return mode

    async def _automation_window_allows(self, guild_id: int) -> bool:
        service = self._settings_service()
        if not service:
            return True
        try:
            window = await service.automation_window(guild_id)
        except Exception:
            window = None
        if not window:
            return True
        start, end = window
        now_minutes = datetime.utcnow().hour * 60 + datetime.utcnow().minute
        if start <= end:
            return start <= now_minutes <= end
        return now_minutes >= start or now_minutes <= end

    async def _apply_automation_rules(
        self,
        guild_id: int,
        player: Optional[lavalink.DefaultPlayer],
        event: str,
    ) -> None:
        if not player:
            return
        mode = await self._automation_mode(guild_id)
        if mode == "off":
            return
        if not await self._automation_window_allows(guild_id):
            return
        queue_changed = False
        trimmed = 0
        if mode in {"smart", "full"}:
            trimmed = self._dedupe_queue(player)
            if trimmed:
                queue_changed = True
                await self._record_automation_action(
                    guild_id,
                    action="queue_trim",
                    origin=event,
                    metadata={"removed": trimmed, "remaining": len(player.queue)},
                )
        auto_started = False
        if mode == "full" and not player.is_playing and player.queue:
            try:
                player.store("suppress_next_announcement", True)
                await player.play()
                queue_changed = True
                auto_started = True
            except Exception:
                pass
        if auto_started:
            await self._record_automation_action(
                guild_id,
                action="auto_restart",
                origin=event,
                metadata={"queueLength": len(player.queue)},
            )
        if queue_changed and self.bot.logger:
            self.bot.logger.info("Automation (%s) adjusted queue for guild %s (%s).", mode, guild_id, event)

    @staticmethod
    def _automation_description(action: str, origin: str, metadata: Dict[str, Any]) -> str:
        if action == "queue_trim":
            removed = int(metadata.get("removed") or 0)
            return f"Removed {removed} duplicate track(s) during {origin}."
        if action == "auto_restart":
            queue_length = metadata.get("queueLength")
            return f"Restarted playback automatically via {origin} ({queue_length} track(s) queued)."
        if action == "command_throttled":
            retry = metadata.get("retryAfter", 0)
            command = metadata.get("command") or origin
            return f"Throttled `{command}` for {int(retry)}s to protect shard capacity."
        return f"Automation recorded {action} via {origin}."

    @staticmethod
    def _dedupe_queue(player: lavalink.DefaultPlayer) -> int:
        queue = list(getattr(player, "queue", []))
        seen = set()
        removed = 0
        cleaned = []
        for track in queue:
            identifier = getattr(track, "identifier", None)
            if identifier and identifier in seen:
                removed += 1
                continue
            if identifier:
                seen.add(identifier)
            cleaned.append(track)
        if removed:
            player.queue.clear()
            for track in cleaned:
                player.queue.append(track)
        return removed
    async def _collaboration_guard(self, inter: discord.Interaction) -> Optional[str]:
        """Return an error if collaborative queueing is disabled."""
        service = self._settings_service()
        if not service or not inter.guild:
            return None
        if await service.is_collaborative(inter.guild.id):
            return None

        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return None
        manager = getattr(self.bot, "dj_permissions", None)
        if manager and manager.has_access(inter.guild.id, member):
            return None

        if manager:
            role_ids = manager.get_roles(inter.guild.id)
            mentions = []
            for role_id in role_ids:
                role = inter.guild.get_role(role_id)
                if role:
                    mentions.append(role.mention)
            if mentions:
                roles = ", ".join(mentions)
                return (
                    "Collaborative queues are disabled. Only DJ roles "
                    f"({roles}) or members with `Manage Server` can queue music."
                )
        return (
            "Collaborative queues are disabled for this server. "
            "Ask an admin to enable it in the control panel or gain DJ permissions."
        )

    async def _guard_queue_capacity(
        self, guild_id: int, existing: int, to_add: int
    ) -> tuple[bool, Optional[QueueCapacity]]:
        service = self._settings_service()
        if not service:
            return True, None
        capacity = await service.check_queue_capacity(
            guild_id,
            existing_tracks=existing,
            tracks_to_add=to_add,
        )
        return capacity.allowed, capacity

    @staticmethod
    def _queue_limit_message(capacity: QueueCapacity) -> str:
        if capacity.remaining <= 0:
            return (
                f"The queue already holds `{capacity.limit}` tracks. "
                f"{capacity.plan_label()} plan servers are limited to {capacity.limit} queued tracks."
            )
        return (
            f"Only `{capacity.remaining}` queue slot(s) remain on the {capacity.plan_label()} plan "
            f"(limit `{capacity.limit}`). Try adding fewer tracks or upgrade the plan."
        )

    async def _apply_source_policy(
        self,
        guild: Optional[discord.Guild],
        tracks: List[lavalink.AudioTrack],
    ) -> tuple[List[lavalink.AudioTrack], Optional[Set[str]], Optional[str]]:
        service = self._settings_service()
        if not service or not guild or not tracks:
            return tracks, None, None
        filtered, allowed, level = await service.filter_tracks_for_guild(guild.id, tracks)
        return filtered, allowed, level

    @staticmethod
    def _format_allowed_sources(allowed: Optional[Set[str]]) -> str:
        if not allowed:
            return "all sources"
        return ", ".join(sorted(name.replace("_", " ").title() for name in allowed))

    def _source_policy_blocked(self, level: Optional[str], allowed: Optional[Set[str]]) -> str:
        allowed_text = self._format_allowed_sources(allowed)
        tier_label = (level or "free").capitalize()
        return (
            f"None of the requested tracks match the allowed sources for the {tier_label} plan. "
            f"Allowed sources: {allowed_text}."
        )

    def _source_policy_warning(self, removed: int, level: Optional[str], allowed: Optional[Set[str]]) -> str:
        allowed_text = self._format_allowed_sources(allowed)
        tier_label = (level or "free").capitalize()
        return (
            f"Skipped {removed} track(s) because the {tier_label} plan only allows: {allowed_text}."
        )

    def _track_payload(self, track: Optional[lavalink.AudioTrack]) -> Optional[Dict[str, Any]]:
        if not track:
            return None
        return {
            "title": track.title,
            "author": track.author,
            "identifier": getattr(track, "identifier", None),
            "uri": getattr(track, "uri", None),
            "duration": getattr(track, "duration", None),
            "requester": getattr(track, "requester", None),
        }

    async def _emit_queue_event(
        self,
        inter: discord.Interaction,
        *,
        event: str,
        track: Optional[lavalink.AudioTrack],
    ) -> None:
        service = self._telemetry()
        if not service or not inter.guild:
            return
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        payload = {
            "track": self._track_payload(track),
            "actor_id": inter.user.id if inter.user else None,
        }
        if player:
            payload.update(self._queue_metrics(player))
        await service.emit(
            event=event,
            guild_id=inter.guild.id,
            shard_id=inter.guild.shard_id if inter.guild else None,
            payload=payload,
        )

    @staticmethod
    def _queue_metrics(player: Optional[lavalink.DefaultPlayer]) -> Dict[str, int]:
        if not player:
            return {}
        queue = list(getattr(player, "queue", []))
        queue_length = len(queue)
        queue_duration = sum(max(0, int(getattr(track, "duration", 0) or 0)) for track in queue)
        return {"queue_length": queue_length, "queue_duration_ms": queue_duration}

    def _dj_manager(self) -> Optional[DJPermissionManager]:
        return getattr(self.bot, "dj_permissions", None)

    def _require_dj(self, inter: discord.Interaction) -> Optional[str]:
        """Return an error message if the invoker lacks DJ permissions."""
        if not inter.guild:
            return "This command can only be used inside a guild."
        manager = self._dj_manager()
        if not manager:
            return None
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if manager.has_access(inter.guild.id, member):
            return None
        role_ids = manager.get_roles(inter.guild.id)
        mentions = []
        for role_id in role_ids:
            role = inter.guild.get_role(role_id)
            if role:
                mentions.append(role.mention)
        if mentions:
            roles_text = ", ".join(mentions)
            return (
                "You must have one of the DJ roles "
                f"({roles_text}) or `Manage Server` permission to use this command."
            )
        return "Only configured DJ roles may use this command. Ask an admin to run `/dj add-role`."

    async def _prepare_dj_command(self, inter: discord.Interaction, *, check_playing: bool = True) -> tuple[Optional[EmbedFactory], Optional[lavalink.DefaultPlayer]]:
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(MSG_GUILD_ONLY, ephemeral=True)
            return None, None
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return None, None
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            await inter.response.send_message(embed=factory.warning(MSG_NOT_CONNECTED), ephemeral=True)
            return None, None
        if check_playing and not player.is_playing:
            await inter.response.send_message(embed=factory.warning(MSG_NOTHING_PLAYING), ephemeral=True)
            return None, None
        return factory, player

    async def _log_dj_action(self, inter: discord.Interaction, action: str, *, details: Optional[str] = None) -> None:
        manager = self._dj_manager()
        if manager and inter.guild:
            await manager.record_action(inter.guild.id, inter.user, action, details=details)

    def _requester_name(self, guild: Optional[discord.Guild], track: lavalink.AudioTrack) -> Optional[str]:
        """Return the display name for the stored requester if available."""
        requester_id = getattr(track, "requester", None)
        if not requester_id:
            return None
        if guild:
            member = guild.get_member(requester_id)
            if member:
                return member.display_name
        user = self.bot.get_user(requester_id)
        if user:
            return user.display_name
        return str(requester_id)

    @staticmethod
    def _progress_bar(position: int, duration: int, length: int = 24) -> str:
        """Render a textual progress bar used in now playing embeds."""
        if duration <= 0:
            return "▫" * length
        ratio = max(0.0, min(position / duration, 1.0))
        filled = int(ratio * length)
        bar = "▬" * filled
        if filled < length:
            bar += "🔘"
            bar += "▬" * (length - filled - 1)
        return bar

    def _permissions_summary(self, me: discord.Member, channel: discord.VoiceChannel) -> Tuple[bool, str]:
        """Summarise voice permissions and indicate if any critical ones are missing."""
        perms = channel.permissions_for(me)
        lines = []
        missing = []
        for attr in VOICE_PERMISSIONS:
            label = attr.replace("_", " ").title()
            granted = getattr(perms, attr, False)
            lines.append(f"{'✅' if granted else '❌'} {label}")
            if not granted:
                missing.append(attr)
        return not missing, "\n".join(lines)

    def _estimated_wait(self, player: lavalink.DefaultPlayer) -> int:
        """Estimate remaining queue time in milliseconds, including the current track."""
        wait = 0
        current = getattr(player, "current", None)
        if current:
            wait += max((current.duration or 0) - player.position, 0)
        wait += sum(track.duration or 0 for track in player.queue)
        return wait

    def _up_next_block(self, player: lavalink.DefaultPlayer, limit: int = 5) -> str:
        """Return a formatted ``Up Next`` list for embeds."""
        if not player.queue:
            return "_Queue empty_"
        lines = []
        for idx, track in enumerate(player.queue[:limit], start=1):
            duration = ms_to_clock(track.duration or 0)
            lines.append(f"`{idx}` {track.title} — {duration}")
        if len(player.queue) > limit:
            lines.append(f"...`{len(player.queue) - limit}` more")
        return "\n".join(lines)

    def _build_nowplaying_embed(
        self,
        player: lavalink.DefaultPlayer,
        guild: Optional[discord.Guild],
        factory: EmbedFactory,
    ) -> Optional[discord.Embed]:
        """Create a rich embed representing the currently playing track."""
        track = getattr(player, "current", None)
        if not track:
            return None

        progress_ms = player.position
        duration_ms = track.duration or 1
        progress = ms_to_clock(progress_ms)
        duration = ms_to_clock(duration_ms)
        bar = self._progress_bar(progress_ms, duration_ms)
        loop_state = {0: "Off", 1: "Track", 2: "Queue"}.get(getattr(player, "loop", 0), "Off")

        embed = factory.track_card(
            title=track.title,
            author=track.author,
            duration=duration,
            url=track.uri,
            requester=self._requester_name(guild, track),
            thumbnail=getattr(track, "artwork_url", None),
            footer_extra=f"{bar} • {progress} / {duration}",
        )
        embed.add_field(name="Source", value=f"`{getattr(track, 'source_name', 'unknown')}`", inline=True)
        embed.add_field(name="Volume", value=f"`{player.volume}%`", inline=True)
        embed.add_field(name="Loop", value=f"`{loop_state}`", inline=True)
        embed.add_field(name="Queue", value=f"`{len(player.queue)} pending`", inline=True)
        embed.add_field(name="Status", value="⏸️ Paused" if player.paused else "🎶 Playing", inline=True)
        embed.add_field(name="Up Next", value=self._up_next_block(player), inline=False)

        lyrics_service = getattr(self.bot, "lyrics_service", None)
        if lyrics_service:
            lyrics_payload = player.fetch("lyrics_payload")
            if lyrics_payload:
                snippet = lyrics_service.snippet(lyrics_payload, position_ms=progress_ms)
                if snippet:
                    embed.add_field(name="Lyrics", value=snippet, inline=False)
        return embed

    def _tag_tracks(
        self, tracks: List[lavalink.AudioTrack], requester: Optional[discord.abc.User]
    ) -> List[lavalink.AudioTrack]:
        """Attach requester metadata to Lavalink track objects."""
        if requester:
            requester_id = requester.id
            for track in tracks:
                track.requester = requester_id
        return tracks

    async def _resolve(self, query: str) -> lavalink.LoadResult:
        query = query.strip()
        search_cache = getattr(self.bot, "search_cache", None)
        limits = getattr(self.bot, "search_limits", None)
        max_results = getattr(limits, "base_results", 5)
        if limits:
            try:
                latency = self.bot.latency * 1000
            except Exception:
                latency = 0
            shard_count = getattr(self.bot, "shard_count", 1) or 1
            players = len(getattr(self.bot.lavalink.player_manager, "players", {}))
            if latency > limits.high_latency_threshold_ms:
                max_results = max(limits.min_results, limits.base_results - 1)
            elif players > shard_count * 10:
                max_results = limits.min_results
            else:
                max_results = min(limits.max_results, limits.base_results + players // max(shard_count, 1))

        cached = None
        if URL_REGEX.match(query):
            result = await self.bot.lavalink.get_tracks(query)
            if getattr(result, "tracks", None):
                return result
        last: Optional[lavalink.LoadResult] = None
        if search_cache:
            cached = search_cache.get(query)
            if cached:
                load_type, tracks = cached
                return SimpleNamespace(load_type=load_type, tracks=tracks)  # type: ignore
        for prefix in ("ytsearch", "scsearch", "amsearch"):
            search_query = f"{prefix}:{query}" if prefix.endswith("search") else query
            result = await self.bot.lavalink.get_tracks(search_query)
            if getattr(result, "tracks", None):
                if max_results and len(result.tracks) > max_results:  # type: ignore
                    result.tracks = result.tracks[:max_results]  # type: ignore
                if search_cache:
                    payload = SimpleNamespace(
                        load_type=result.load_type,  # type: ignore
                        tracks=list(result.tracks),  # type: ignore
                    )
                    search_cache.set(query, payload)
                return result
            last = result
        if search_cache and last and getattr(last, "tracks", None):
            payload = SimpleNamespace(load_type=last.load_type, tracks=list(last.tracks))  # type: ignore
            search_cache.set(query, payload)
        return last or await self.bot.lavalink.get_tracks(query)

    async def _player(self, inter: discord.Interaction) -> Optional[lavalink.DefaultPlayer]:
        factory = EmbedFactory(inter.guild.id if inter.guild else None)

        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return None

        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not member or not member.voice or not member.voice.channel:
            await inter.response.send_message(embed=factory.error("You must be in a voice channel."), ephemeral=True)
            return None

        player = self.bot.lavalink.player_manager.get(inter.guild.id)

        me = inter.guild.me or inter.guild.get_member(self.bot.user.id)  # type: ignore[arg-type]
        if inter.guild.voice_client is None:
            channel: discord.VoiceChannel = member.voice.channel  # type: ignore
            if not me:
                await inter.response.send_message(
                    embed=factory.error("Unable to determine my guild member object."),
                    ephemeral=True,
                )
                return None
            ok, summary = self._permissions_summary(me, channel)
            if not ok:
                await inter.response.send_message(
                    embed=factory.error("Missing voice permissions:\n" + summary),
                    ephemeral=True,
                )
                return None
            if not await self._ensure_lavalink_available(inter, factory):
                return None
            try:
                await channel.connect(cls=LavalinkVoiceClient)  # type: ignore[arg-type]
            except ClientError as exc:
                bot_logger = getattr(self.bot, "logger", None)
                if bot_logger:
                    bot_logger.warning("Lavalink not available for guild %s: %s", inter.guild.id, exc)
                await self._send_ephemeral(
                    inter,
                    factory.error(
                        "No Lavalink node is currently available. Please ensure the server is running and reachable."
                    ),
                )
                return None
            except Exception as exc:  # pragma: no cover - network/Discord behaviour
                bot_logger = getattr(self.bot, "logger", None)
                if bot_logger:
                    bot_logger.error("Voice connection failed for guild %s: %s", inter.guild.id, exc)
                await self._send_ephemeral(
                    inter,
                    factory.error("Unable to join the voice channel right now. Please try again in a moment."),
                )
                return None
            player = self.bot.lavalink.player_manager.get(inter.guild.id)

        if not player:
            error_embed = factory.error("Failed to establish Lavalink player.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return None

        if not player.is_connected:
            for _ in range(20):
                if player.is_connected:
                    break
                await asyncio.sleep(0.1)

        player.text_channel_id = getattr(inter.channel, "id", None)
        manager = getattr(self.bot, "profile_manager", None)
        settings_service = getattr(self.bot, "server_settings", None)
        if manager:
            profile = manager.get(inter.guild.id)
            player.store("autoplay_enabled", profile.autoplay)
            player.store("announcement_style", profile.announcement_style)
            desired_volume = (
                settings_service.global_default_volume() if settings_service else None
            ) or profile.default_volume
            if player.volume != desired_volume:
                await player.set_volume(desired_volume)
        await self._apply_player_region(inter.guild.id, player)
        return player

    # ------------------------------------------------------------------ commands
    @app_commands.command(name="play", description="Play a song or playlist by search or URL.")
    @app_commands.describe(query="Search query, URL, or playlist link.")
    async def play(self, inter: discord.Interaction, query: str) -> None:
        """Queue one or more tracks based on a search query or direct URL."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(MSG_GUILD_ONLY, ephemeral=True)
            return
        if not await self._throttle_command(inter, "play"):
            return
        await inter.response.defer()

        if inter.guild:
            collab_error = await self._collaboration_guard(inter)
            if collab_error:
                await inter.followup.send(embed=factory.error(collab_error), ephemeral=True)
                return

        player = await self._player(inter)
        if not player:
            return

        results = await self._resolve(query)
        if results.load_type == "LOAD_FAILED":
            await inter.followup.send(embed=factory.error("Loading the track failed."), ephemeral=True)
            return
        if not results.tracks:
            await inter.followup.send(embed=factory.warning("No tracks found for this query."), ephemeral=True)
            return

        requester = inter.user if isinstance(inter.user, discord.abc.User) else None
        tracks = self._tag_tracks(results.tracks, requester)
        is_playlist = results.load_type == "PLAYLIST_LOADED"
        playlist_name = None
        if is_playlist:
            playlist_info = getattr(results, "playlist_info", None)
            playlist_name = getattr(playlist_info, "name", None)
            selected_idx = getattr(playlist_info, "selectedTrack", -1)
            if isinstance(selected_idx, int) and 0 <= selected_idx < len(tracks):
                # Align order to the playlist selection while keeping the original sequence intact.
                tracks = tracks[selected_idx:] + tracks[:selected_idx]

        policy_hint: Optional[str] = None
        original_track_count = len(tracks)
        if inter.guild:
            tracks, allowed_sources, source_level = await self._apply_source_policy(inter.guild, tracks)
            if not tracks:
                warning_text = self._source_policy_blocked(source_level, allowed_sources)
                await inter.followup.send(embed=factory.warning(warning_text), ephemeral=True)
                return
            if allowed_sources and len(tracks) < original_track_count:
                removed = original_track_count - len(tracks)
                policy_hint = self._source_policy_warning(removed, source_level, allowed_sources)

        if results.load_type == "PLAYLIST_LOADED":
            selected = tracks
        elif results.load_type == "SEARCH_RESULT":
            count = min(3, len(tracks))
            indices = secrets.SystemRandom().sample(range(len(tracks)), count)  # NOSONAR
            selected = [tracks[i] for i in indices]
        else:
            selected = tracks[:1]

        if not selected:
            await inter.followup.send(embed=factory.warning("No playable tracks found."), ephemeral=True)
            return

        if inter.guild:
            allowed, capacity = await self._guard_queue_capacity(
                inter.guild.id, len(player.queue), len(selected)
            )
            if not allowed and capacity:
                warning = self._queue_limit_message(capacity)
                await self._notify_capacity_block(inter.guild.id, capacity)
                await inter.followup.send(embed=factory.warning(warning), ephemeral=True)
                return

        first = selected[0]
        should_start = not player.is_playing and not player.paused and not player.current

        for track in selected:
            player.add(track)

        copilot = self._queue_copilot_service()
        copilot_meta: Dict[str, Any] = {}
        if copilot and inter.guild:
            try:
                copilot_meta = await copilot.on_tracks_added(player, selected, guild_id=inter.guild.id)
            except Exception as exc:  # pragma: no cover - defensive
                bot_logger = getattr(self.bot, "logger", None)
                if bot_logger:
                    bot_logger.debug("Queue copilot failed: %s", exc)

        estimated_wait = self._estimated_wait(player)

        if should_start:
            player.store("suppress_next_announcement", True)
            await player.play()
            embed = factory.track_card(
                title=first.title,
                author=first.author,
                duration=ms_to_clock(first.duration),
                url=first.uri,
                requester=inter.user.display_name if requester else None,
                thumbnail=getattr(first, "artwork_url", None),
            )
            embed.add_field(name="Source", value=f"`{getattr(first, 'source_name', 'unknown')}`", inline=True)
            embed.add_field(name="Estimated Wait", value="`Playing now`", inline=True)
        else:
            embed = factory.success("Queued", f"**{first.title}** — `{first.author}`")
            embed.add_field(name="Source", value=f"`{getattr(first, 'source_name', 'unknown')}`", inline=True)
            embed.add_field(name="Estimated Wait", value=f"`{ms_to_clock(estimated_wait)}`", inline=True)

        if len(selected) > 1:
            embed.add_field(name="Queue", value=f"Added **{len(selected)}** track(s).", inline=False)
        if is_playlist and playlist_name:
            embed.add_field(name="Playlist", value=playlist_name, inline=True)
        embed.add_field(name="Up Next", value=self._up_next_block(player), inline=False)
        if policy_hint:
            embed.add_field(name="Source Policy", value=policy_hint, inline=False)

        meta: Dict[str, Any] = {"count": len(selected)}
        if copilot_meta.get("actions"):
            meta["copilot"] = copilot_meta
            embed.add_field(name="Queue Copilot", value=", ".join(copilot_meta["actions"]), inline=False)
        await self._publish_queue_state(player, "tracks_added", meta)
        await inter.followup.send(embed=embed)
        if inter.guild:
            await self._apply_automation_rules(inter.guild.id, player, "play")
            await self._record_compliance(inter.guild.id, "queue_add", {"count": len(selected)})
            await self._record_analytics(
                inter.guild.id,
                "queue_add",
                {"count": len(selected), "policy_hint": bool(policy_hint)},
            )

    @app_commands.command(name="skip", description="Skip the current track.")
    async def skip(self, inter: discord.Interaction) -> None:
        """Skip the active track and continue with the next track in queue."""
        factory, player = await self._prepare_dj_command(inter, check_playing=True)
        if not factory or not player:
            return
        current = getattr(player, "current", None)
        await player.skip()
        embed = factory.primary("⏭ Skipped")
        embed.add_field(name="Queue", value=f"`{len(player.queue)}` remaining", inline=True)
        await inter.response.send_message(embed=embed, ephemeral=True)
        if current:
            details = f"{current.title} — {current.author}"
        else:
            details = None
        await self._log_dj_action(inter, "skip", details=details)
        await self._emit_queue_event(inter, event="skip", track=current)
        await self._publish_queue_state(player, "skip")
        await self._apply_automation_rules(inter.guild.id, player, "skip")
        await self._record_compliance(inter.guild.id, "skip", {"track": self._track_payload(current)})
        await self._record_analytics(
            inter.guild.id,
            "skip",
            {"remaining": len(player.queue)},
        )

    @app_commands.command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, inter: discord.Interaction) -> None:
        """Stop playback completely and clear the queue."""
        factory, player = await self._prepare_dj_command(inter, check_playing=False)
        if not factory or not player:
            return
        player.queue.clear()
        await player.stop()
        embed = factory.success("Stopped", "Playback ended and queue cleared.")
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "stop", details="Cleared queue")
        await self._publish_queue_state(player, "stop")
        await self._apply_automation_rules(inter.guild.id, player, "stop")
        await self._record_compliance(inter.guild.id, "stop", {"remaining": len(player.queue)})
        await self._record_analytics(
            inter.guild.id,
            "stop",
            {"cleared": True},
        )

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, inter: discord.Interaction) -> None:
        """Pause the player."""
        factory, player = await self._prepare_dj_command(inter, check_playing=True)
        if not factory or not player:
            return
        if player.paused:
            await inter.response.send_message(embed=factory.warning("Already paused."), ephemeral=True)
            return
        await player.set_pause(True)
        embed = factory.primary("⏸️ Paused")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            await self._log_dj_action(inter, "pause", details=player.current.title)

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, inter: discord.Interaction) -> None:
        """Resume the player if it is paused."""
        factory, player = await self._prepare_dj_command(inter, check_playing=True)
        if not factory or not player:
            return
        if not player.paused:
            await inter.response.send_message(embed=factory.warning("Playback is not paused."), ephemeral=True)
            return
        await player.set_pause(False)
        embed = factory.primary("▶ Resumed")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            await self._log_dj_action(inter, "resume", details=player.current.title)

    @app_commands.command(name="nowplaying", description="Show the currently playing track with live updates.")
    async def nowplaying(self, inter: discord.Interaction) -> None:
        """Display the currently playing track with live updates."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(MSG_GUILD_ONLY, ephemeral=True)
            return
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing or not player.current:
            await inter.response.send_message(embed=factory.warning(MSG_NOTHING_PLAYING), ephemeral=True)
            return

        embed = self._build_nowplaying_embed(player, inter.guild, factory)
        if not embed:
            await inter.response.send_message(embed=factory.warning("No active track."), ephemeral=True)
            return

        view = NowPlayingView(self, inter.guild.id)
        await inter.response.send_message(embed=embed, view=view)
        message = await inter.original_response()
        await view.start(message)

    @app_commands.command(name="volume", description="Set playback volume (0-200%).")
    @app_commands.describe(level="Volume percentage between 0 and 200.")
    async def volume(self, inter: discord.Interaction, level: app_commands.Range[int, 0, 200]) -> None:
        """Adjust the playback volume."""
        factory, player = await self._prepare_dj_command(inter, check_playing=False)
        if not factory or not player:
            return
        await player.set_volume(level)
        embed = factory.primary("🔊 Volume Updated", f"Set to **{level}%**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "volume", details=f"{level}%")

    @app_commands.command(name="volume-info", description="Show the current and default volume settings.")
    async def volume_info(self, inter: discord.Interaction) -> None:
        """Display current volume plus the defaults that will be applied."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(
                embed=factory.warning(MSG_GUILD_ONLY),
                ephemeral=True,
            )
            return

        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        current_volume = getattr(player, "volume", None)

        profile_manager = self._profile_manager()
        profile = profile_manager.get(inter.guild.id) if profile_manager else None

        settings_service = self._settings_service()
        global_default = settings_service.global_default_volume() if settings_service else None
        guild_default = getattr(profile, "default_volume", None)
        applied_default = global_default or guild_default

        embed = factory.primary("🔊 Volume Info")
        embed.add_field(
            name="Current Volume",
            value=f"`{current_volume}%`" if current_volume is not None else "Not connected",
            inline=True,
        )
        embed.add_field(
            name="Applied Default",
            value=f"`{applied_default}%`" if applied_default is not None else "Not configured",
            inline=True,
        )
        embed.add_field(
            name="Guild Profile Default",
            value=f"`{guild_default}%`" if guild_default is not None else "Not set",
            inline=True,
        )
        embed.add_field(
            name="Global Default (Control Panel)",
            value=f"`{global_default}%`" if global_default is not None else "Not set",
            inline=True,
        )
        embed.set_footer(text="Defaults apply automatically when the bot joins voice.")

        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="loop", description="Set loop mode for playback.")
    @app_commands.choices(
        mode=[
            app_commands.Choice(name="Off", value=0),
            app_commands.Choice(name="Track", value=1),
            app_commands.Choice(name="Queue", value=2),
        ]
    )
    async def loop(self, inter: discord.Interaction, mode: app_commands.Choice[int]) -> None:
        """Set the loop mode for the player."""
        factory, player = await self._prepare_dj_command(inter, check_playing=False)
        if not factory or not player:
            return
        player.loop = mode.value  # type: ignore
        embed = factory.primary("🔁 Loop Mode", f"Loop set to **{mode.name}**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "loop", details=mode.name)

    @app_commands.command(name="timeshift", description="Shift the current track to a specific timestamp (mm:ss).")
    @app_commands.describe(position="Timestamp to move to, e.g. 1:30")
    async def timeshift(self, inter: discord.Interaction, position: str):
        """Move to a timestamp within the current track without restarting playback."""
        factory, player = await self._prepare_dj_command(inter, check_playing=True)
        if not factory or not player:
            return

        try:
            mins, secs = map(int, position.split(":"))
            target = (mins * 60 + secs) * 1000
        except ValueError:
            await inter.response.send_message(
                embed=factory.error("Invalid time format. Use `mm:ss`."),
                ephemeral=True,
            )
            return

        target = getattr(locals(), "target", 0)
        if target >= player.current.duration:
            await inter.response.send_message(
                embed=factory.warning("Shift position is beyond track duration."),
                ephemeral=True,
            )

        await player.seek(target)
        embed = factory.primary("Timeshifted", f"Moved to **{position}**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "timeshift", details=position)

    @app_commands.command(name="replay", description="Restart the current track from the beginning.")
    async def replay(self, inter: discord.Interaction) -> None:
        """Restart the current track from the beginning."""
        factory, player = await self._prepare_dj_command(inter, check_playing=True)
        if not factory or not player:
            return
        await player.seek(0)
        embed = factory.primary("🔁 Replay", f"Restarted **{player.current.title}**")  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            self._log_dj_action(inter, "replay", details=player.current.title)  # type: ignore


async def setup(bot: commands.Bot):
    await bot.add_cog(MusicControls(bot))


class NowPlayingView(discord.ui.View):
    """Auto-updating view for now playing embeds with playback controls."""

    def __init__(self, controls: MusicControls, guild_id: int, *, timeout: float = 120.0):
        super().__init__(timeout=timeout)
        self.controls = controls
        self.guild_id = guild_id
        self.message: Optional[discord.Message] = None
        self._auto_task: Optional[asyncio.Task] = None

    async def start(self, message: discord.Message):
        """Start the auto-refresh loop once the message is available."""
        self.message = message
        self._auto_task = asyncio.create_task(self._auto_update())

    async def refresh(self):
        """Re-render the embed with the latest playback state."""
        if not self.guild_id:
            return
        player = self.controls.bot.lavalink.player_manager.get(self.guild_id)
        factory = EmbedFactory(self.guild_id)
        if player and player.is_playing and player.current:
            guild = self.controls.bot.get_guild(self.guild_id)
            embed = self.controls._build_nowplaying_embed(player, guild, factory)
            view = self
        else:
            embed = factory.warning("Nothing is playing right now.")
            view = None
            self.disable_all_items()
        if self.message and embed:
            try:
                await self.message.edit(embed=embed, view=view)
            except discord.HTTPException:
                pass

    async def _auto_update(self):
        """Periodically refresh the now playing embed."""
        try:
            while True:
                await asyncio.sleep(5)
                await self.refresh()
        except asyncio.CancelledError:
            pass

    async def on_timeout(self):
        """Stop auto updates when the view times out."""
        if self._auto_task:
            self._auto_task.cancel()
        self.disable_all_items()
        if self.message:
            try:
                await self.message.edit(view=None)
            except discord.HTTPException:
                pass

    def disable_all_items(self):
        """Gracefully disable every interactive component in the view."""
        for child in getattr(self, "children", []):
            try:
                setattr(child, "disabled", True)
            except AttributeError:
                pass

    @discord.ui.button(emoji="⏯️", style=discord.ButtonStyle.secondary, row=0)
    async def pause_resume(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Toggle pause/resume."""
        if not self.guild_id:
            return
        player = self.controls.bot.lavalink.player_manager.get(self.guild_id)
        if player and player.paused:
            await self.controls.resume.callback(self.controls, interaction)  # type: ignore
        else:
            await self.controls.pause.callback(self.controls, interaction)  # type: ignore
        await self.refresh()

    @discord.ui.button(emoji="⏭️", style=discord.ButtonStyle.secondary, row=0)
    async def skip_track(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Skip current track."""
        await self.controls.skip.callback(self.controls, interaction)  # type: ignore
        await self.refresh()

    @discord.ui.button(emoji="⏹️", style=discord.ButtonStyle.danger, row=0)
    async def stop_player(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Stop playback."""
        await self.controls.stop.callback(self.controls, interaction)  # type: ignore
        await self.refresh()

    @discord.ui.button(emoji="🔁", style=discord.ButtonStyle.secondary, row=0)
    async def cycle_loop(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Cycle loop mode."""
        player = self.controls.bot.lavalink.player_manager.get(self.guild_id)
        if not player:
            await interaction.response.send_message(MSG_NOT_CONNECTED, ephemeral=True)
            return

        # 0=Off, 1=Track, 2=Queue
        current = getattr(player, "loop", 0)
        next_mode = (current + 1) % 3
        choice_name = {0: "Off", 1: "Track", 2: "Queue"}[next_mode]
        choice = app_commands.Choice(name=choice_name, value=next_mode)
        
        await self.controls.loop.callback(self.controls, interaction, choice)  # type: ignore
        await self.refresh()

    @discord.ui.button(label="Refresh", emoji="🔄", style=discord.ButtonStyle.primary, row=0)
    async def refresh_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Allow users to refresh the embed on demand."""
        await self.refresh()
        if not interaction.response.is_done():
            await interaction.response.defer()
