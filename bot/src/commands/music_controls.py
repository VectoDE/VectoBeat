from __future__ import annotations

import asyncio
import random
import re
from types import SimpleNamespace
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.services.lavalink_service import LavalinkVoiceClient
from src.services.server_settings_service import QueueCapacity
from src.utils.embeds import EmbedFactory

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

    # pyright: reportMissingTypeStubs=false

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ------------------------------------------------------------------ helpers
    def _telemetry(self):
        return getattr(self.bot, "queue_telemetry", None)

    def _settings_service(self):
        return getattr(self.bot, "server_settings", None)

    def _queue_sync_service(self):
        return getattr(self.bot, "queue_sync", None)

    def _shard_supervisor(self):
        return getattr(self.bot, "shard_supervisor", None)

    def _alert_service(self):
        return getattr(self.bot, "alerts", None)

    def _automation_audit_service(self):
        return getattr(self.bot, "automation_audit", None)

    def _command_throttle_service(self):
        return getattr(self.bot, "command_throttle", None)

    def _analytics_export_service(self):
        return getattr(self.bot, "analytics_export", None)

    def _queue_copilot_service(self):
        return getattr(self.bot, "queue_copilot", None)

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
            metadata={"command": bucket, "retryAfter": float(retry_after)},
            category="throttle",
        )
        return False

    async def _record_analytics(self, guild_id: int, event: str, payload: Dict[str, Any]) -> None:
        service = self._analytics_export_service()
        if service:
            await service.record_event(guild_id, event, payload)

    def _profile_manager(self):
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
            retry = metadata.get("retryAfter")
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

    def _track_payload(self, track: Optional[lavalink.AudioTrack]) -> Optional[dict]:
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
            "actor_id": getattr(inter.user, "id", None),
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
    def _queue_metrics(player: Optional[lavalink.DefaultPlayer]) -> Dict[str, Any]:
        if not player:
            return {}
        queue = list(getattr(player, "queue", []))
        queue_length = len(queue)
        queue_duration = sum(max(0, int(getattr(track, "duration", 0) or 0)) for track in queue)
        return {"queue_length": queue_length, "queue_duration_ms": queue_duration}

    def _dj_manager(self):
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

    def _log_dj_action(self, inter: discord.Interaction, action: str, *, details: Optional[str] = None) -> None:
        manager = self._dj_manager()
        if manager and inter.guild:
            manager.record_action(inter.guild.id, inter.user, action, details=details)

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
            if result.tracks:
                return result
        last: Optional[lavalink.LoadResult] = None
        if search_cache:
            cached = search_cache.get(query)
            if cached:
                load_type, tracks = cached
                return SimpleNamespace(load_type=load_type, tracks=tracks)
        for prefix in ("ytsearch", "scsearch", "amsearch"):
            search_query = f"{prefix}:{query}" if prefix.endswith("search") else query
            result = await self.bot.lavalink.get_tracks(search_query)
            if result.tracks:
                if max_results and len(result.tracks) > max_results:
                    result.tracks = result.tracks[:max_results]
                if search_cache:
                    payload = SimpleNamespace(
                        load_type=result.load_type,
                        tracks=list(result.tracks),
                    )
                    search_cache.set(query, payload)
                return result
            last = result
        if search_cache and last and last.tracks:
            payload = SimpleNamespace(load_type=last.load_type, tracks=list(last.tracks))
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
            await channel.connect(cls=LavalinkVoiceClient)  # type: ignore[arg-type]
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
    async def play(self, inter: discord.Interaction, query: str):
        """Queue one or more tracks based on a search query or direct URL."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "play"):
            return
        await inter.response.defer()

        if inter.guild:
            collab_error = await self._collaboration_guard(inter)
            if collab_error:
                return await inter.followup.send(embed=factory.error(collab_error), ephemeral=True)

        player = await self._player(inter)
        if not player:
            return

        results = await self._resolve(query)
        if results.load_type == "LOAD_FAILED":
            return await inter.followup.send(embed=factory.error("Loading the track failed."), ephemeral=True)
        if not results.tracks:
            return await inter.followup.send(embed=factory.warning("No tracks found for this query."), ephemeral=True)

        requester = inter.user if isinstance(inter.user, discord.abc.User) else None
        tracks = self._tag_tracks(results.tracks, requester)

        policy_hint: Optional[str] = None
        original_track_count = len(tracks)
        if inter.guild:
            tracks, allowed_sources, source_level = await self._apply_source_policy(inter.guild, tracks)
            if not tracks:
                warning_text = self._source_policy_blocked(source_level, allowed_sources)
                return await inter.followup.send(embed=factory.warning(warning_text), ephemeral=True)
            if allowed_sources and len(tracks) < original_track_count:
                removed = original_track_count - len(tracks)
                policy_hint = self._source_policy_warning(removed, source_level, allowed_sources)

        if results.load_type == "PLAYLIST_LOADED":
            selected = tracks
        elif results.load_type == "SEARCH_RESULT":
            count = min(3, len(tracks))
            selected = random.sample(tracks, k=count) if count else tracks[:1]
        else:
            selected = tracks[:1]

        if not selected:
            return await inter.followup.send(embed=factory.warning("No playable tracks found."), ephemeral=True)

        if inter.guild:
            allowed, capacity = await self._guard_queue_capacity(
                inter.guild.id, len(player.queue), len(selected)
            )
            if not allowed and capacity:
                warning = self._queue_limit_message(capacity)
                await self._notify_capacity_block(inter.guild.id, capacity)
                return await inter.followup.send(embed=factory.warning(warning), ephemeral=True)

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
                self.bot.logger and self.bot.logger.debug("Queue copilot failed: %s", exc)

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
    async def skip(self, inter: discord.Interaction):
        """Skip the active track and continue with the next track in queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "skip"):
            return
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing to skip."), ephemeral=True)
        current = getattr(player, "current", None)
        await player.skip()
        embed = factory.primary("⏭ Skipped")
        embed.add_field(name="Queue", value=f"`{len(player.queue)}` remaining", inline=True)
        await inter.response.send_message(embed=embed, ephemeral=True)
        if current:
            details = f"{current.title} — {current.author}"
        else:
            details = None
        self._log_dj_action(inter, "skip", details=details)
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
    async def stop(self, inter: discord.Interaction):
        """Stop playback completely and clear the queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "stop"):
            return
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        player.queue.clear()
        await player.stop()
        embed = factory.success("Stopped", "Playback ended and queue cleared.")
        await inter.response.send_message(embed=embed, ephemeral=True)
        self._log_dj_action(inter, "stop", details="Cleared queue")
        await self._publish_queue_state(player, "stop")
        await self._apply_automation_rules(inter.guild.id, player, "stop")
        await self._record_compliance(inter.guild.id, "stop", {"remaining": len(player.queue)})
        await self._record_analytics(
            inter.guild.id,
            "stop",
            {"cleared": True},
        )

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, inter: discord.Interaction):
        """Pause the player."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        if player.paused:
            return await inter.response.send_message(embed=factory.warning("Already paused."), ephemeral=True)
        await player.set_pause(True)
        embed = factory.primary("⏸️ Paused")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            self._log_dj_action(inter, "pause", details=player.current.title)  # type: ignore

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, inter: discord.Interaction):
        """Resume the player if it is paused."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        if not player.paused:
            return await inter.response.send_message(embed=factory.warning("Playback is not paused."), ephemeral=True)
        await player.set_pause(False)
        embed = factory.primary("▶ Resumed")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            self._log_dj_action(inter, "resume", details=player.current.title)  # type: ignore

    @app_commands.command(name="nowplaying", description="Show the currently playing track with live updates.")
    async def nowplaying(self, inter: discord.Interaction):
        """Display the currently playing track with live updates."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing or not player.current:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)

        embed = self._build_nowplaying_embed(player, inter.guild, factory)
        if not embed:
            return await inter.response.send_message(embed=factory.warning("No active track."), ephemeral=True)

        view = NowPlayingView(self, inter.guild.id)
        await inter.response.send_message(embed=embed, view=view)
        message = await inter.original_response()
        await view.start(message)

    @app_commands.command(name="volume", description="Set playback volume (0-200%).")
    @app_commands.describe(level="Volume percentage between 0 and 200.")
    async def volume(self, inter: discord.Interaction, level: app_commands.Range[int, 0, 200]):
        """Adjust the playback volume."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        await player.set_volume(level)
        embed = factory.primary("🔊 Volume Updated", f"Set to **{level}%**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        self._log_dj_action(inter, "volume", details=f"{level}%")

    @app_commands.command(name="volume-info", description="Show the current and default volume settings.")
    async def volume_info(self, inter: discord.Interaction):
        """Display current volume plus the defaults that will be applied."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(
                embed=factory.warning("This command can only be used inside a server."),
                ephemeral=True,
            )

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
            value=f"`{current_volume}%`" if isinstance(current_volume, (int, float)) else "Not connected",
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
    async def loop(self, inter: discord.Interaction, mode: app_commands.Choice[int]):
        """Set the loop mode for the player."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        player.loop = mode.value  # type: ignore
        embed = factory.primary("🔁 Loop Mode", f"Loop set to **{mode.name}**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        self._log_dj_action(inter, "loop", details=mode.name)

    @app_commands.command(name="jump", description="Jump within the current track (mm:ss).")
    @app_commands.describe(position="Timestamp to jump to, e.g. 1:30")
    async def jump(self, inter: discord.Interaction, position: str):
        """Jump to a specific timestamp within the current track."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing or not player.current:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)

        try:
            mins, secs = map(int, position.split(":"))
            target = (mins * 60 + secs) * 1000
        except ValueError:
            return await inter.response.send_message(
                embed=factory.error("Invalid time format. Use `mm:ss`."),
                ephemeral=True,
            )

        if target >= player.current.duration:
            return await inter.response.send_message(
                embed=factory.warning("Jump position is beyond track duration."),
                ephemeral=True,
            )

        await player.seek(target)
        embed = factory.primary("⏩ Jumped", f"Jumped to **{position}**")
        await inter.response.send_message(embed=embed, ephemeral=True)
        self._log_dj_action(inter, "jump", details=position)

    @app_commands.command(name="replay", description="Restart the current track from the beginning.")
    async def replay(self, inter: discord.Interaction):
        """Restart the current track from the beginning."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._require_dj(inter)) is not None:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing or not player.current:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        await player.seek(0)
        embed = factory.primary("🔁 Replay", f"Restarted **{player.current.title}**")  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)
        if player.current:
            self._log_dj_action(inter, "replay", details=player.current.title)  # type: ignore


async def setup(bot: commands.Bot):
    await bot.add_cog(MusicControls(bot))


class NowPlayingView(discord.ui.View):
    """Auto-updating view for now playing embeds."""

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
        for child in self.children:
            child.disabled = True

    @discord.ui.button(label="Refresh", style=discord.ButtonStyle.secondary)
    async def refresh_button(  # type: ignore[override]
        self, interaction: discord.Interaction, button: discord.ui.Button
    ):
        """Allow users to refresh the embed on demand."""
        await self.refresh()
        if not interaction.response.is_done():
            await interaction.response.defer()
