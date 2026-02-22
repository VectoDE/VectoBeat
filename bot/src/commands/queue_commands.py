from __future__ import annotations

import math
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from urllib.parse import urlparse

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.services.playlist_service import PlaylistService, PlaylistStorageError
from src.services.server_settings_service import QueueCapacity
from src.utils.embeds import EmbedFactory
from src.utils.progress import SlashProgress
from src.utils.pagination import EmbedPaginator

if TYPE_CHECKING:
    from src.services.dj_permission_service import DJPermissionManager
    from src.services.server_settings_service import ServerSettingsService
    from src.services.queue_sync_service import QueueSyncService
    from src.services.shard_supervisor import ShardSupervisor
    from src.services.alert_service import AlertService
    from src.services.automation_audit_service import AutomationAuditService
    from src.services.command_throttle_service import CommandThrottleService
    from src.services.analytics_export_service import AnalyticsExportService
    from src.services.queue_copilot_service import QueueCopilotService

if TYPE_CHECKING:
    from src.services.dj_permission_service import DJPermissionManager
    from src.services.server_settings_service import ServerSettingsService
    from src.services.queue_sync_service import QueueSyncService
    from src.services.shard_supervisor import ShardSupervisor
    from src.services.alert_service import AlertService
    from src.services.automation_audit_service import AutomationAuditService
    from src.services.command_throttle_service import CommandThrottleService
    from src.services.analytics_export_service import AnalyticsExportService
    from src.services.queue_copilot_service import QueueCopilotService


def ms_to_clock(ms: int) -> str:
    """Convert milliseconds to ``H:MM:SS`` or ``M:SS`` for queue displays."""
    seconds = max(0, int(ms // 1000))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:d}:{sec:02d}"


def track_str(track: lavalink.AudioTrack) -> str:
    """Return a rich string describing a Lavalink track."""
    return f"**{track.title}** — `{track.author}` (`{ms_to_clock(track.duration)}`)"


def shuffle_tracks(tracks: list) -> None:
    for i in range(len(tracks) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        tracks[i], tracks[j] = tracks[j], tracks[i]

PLAYLIST_STORAGE_LIMITS = {
    "free": 0,
    "starter": 50,
    "pro": math.inf,
    "growth": math.inf,
    "scale": math.inf,
    "enterprise": math.inf,
}

PLAN_LABELS = {
    "free": "Free",
    "starter": "Starter",
    "pro": "Pro",
    "growth": "Growth",
    "scale": "Scale",
    "enterprise": "Enterprise",
}


class QueueCommands(commands.Cog):
    """Queue management commands."""

    def __init__(self, bot: commands.Bot):
        from typing import cast, Any
        from src.main import VectoBeat
        self.bot: VectoBeat = cast(Any, bot)

    def _dj_manager(self) -> Optional[DJPermissionManager]:
        return getattr(self.bot, "dj_permissions", None)

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

    async def _publish_queue_state(
        self,
        guild_id: int,
        player: Optional[lavalink.DefaultPlayer],
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        service = self._queue_sync_service()
        if service and player:
            await service.publish_state(guild_id, player, reason, metadata=metadata)

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
            await service.moderator_alert(
                guild_id,
                "Queue limit reached; additional tracks were blocked.",
                limit=capacity.limit,
                remaining=capacity.remaining,
                tier=capacity.plan_label(),
            )
    async def _playlist_sync_enabled(self, guild_id: int) -> bool:
        service = self._settings_service()
        if not service:
            return False
        try:
            state = await service.get_settings(guild_id)
        except Exception as exc:  # pragma: no cover - network calls
            if self.bot.logger:
                self.bot.logger.debug("Failed to fetch server settings for playlist sync (%s): %s", guild_id, exc)
            return False
        tier = (state.tier or "free").lower()
        if tier not in {"starter", "pro", "growth", "scale", "enterprise"}:
            return False
        return bool(state.settings.get("playlistSync"))

    @staticmethod
    def _looks_like_url(value: str) -> bool:
        try:
            parsed = urlparse(value.strip())
        except ValueError:
            return False
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)

    def _require_dj(self, inter: discord.Interaction) -> Optional[str]:
        """Return an error message if the invoker lacks DJ permissions."""
        if not inter.guild:
            return "This command can only be used inside a guild."
        manager = self._dj_manager()
        if not manager or not manager.has_restrictions(inter.guild.id):
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
            roles = ", ".join(mentions)
            return (
                "You must have one of the DJ roles "
                f"({roles}) or `Manage Server` permission to use this command."
            )
        return "Only configured DJ roles may use this command. Ask an admin to run `/dj add-role`."

    async def _log_dj_action(self, inter: discord.Interaction, action: str, *, details: Optional[str] = None) -> None:
        manager = self._dj_manager()
        if manager and inter.guild:
            await manager.record_action(inter.guild.id, inter.user, action, details=details)

    async def _player(self, guild: discord.Guild) -> Optional[lavalink.DefaultPlayer]:
        """Fetch the guild-specific Lavalink player instance."""
        player = self.bot.lavalink.player_manager.get(guild.id)
        await self._apply_player_region(guild.id, player)
        return player

    def _queue_summary(self, player: lavalink.DefaultPlayer) -> str:
        """Summarise queue length and remaining playtime."""
        total_tracks = len(player.queue)
        duration = sum(track.duration or 0 for track in player.queue)
        duration += max((player.current.duration - player.position) if player.current else 0, 0)
        return f"`{total_tracks}` tracks • `{ms_to_clock(duration)}` remaining"

    @staticmethod
    def _plan_label(tier: str) -> str:
        return PLAN_LABELS.get(tier, tier.title())

    def _playlist_service(self) -> PlaylistService:
        service = getattr(self.bot, "playlist_service", None)
        if not service:
            raise RuntimeError("PlaylistService not initialised on bot.")
        return service

    async def _refresh_synced_playlist(
        self,
        guild: discord.Guild,
        playlist_name: str,
        metadata: Dict[str, Any],
        requester_id: Optional[int],
    ) -> Optional[tuple[List[lavalink.AudioTrack], Dict[str, Any]]]:
        sync_info = metadata.get("sync")
        if not isinstance(sync_info, dict):
            return None
        source = sync_info.get("source")
        if not isinstance(source, str) or not source:
            return None
        try:
            result = await self.bot.lavalink.get_tracks(source)
        except Exception as exc:  # pragma: no cover - network safeguard
            if self.bot.logger:
                self.bot.logger.warning(
                    "Failed to refresh synced playlist '%s' for guild %s: %s",
                    playlist_name,
                    guild.id,
                    exc,
                )
            return None
        if not result or not result.tracks:
            return None
        refreshed = list(result.tracks)
        if requester_id:
            for track in refreshed:
                track.requester = requester_id
        updated_meta = {
            **metadata,
            "sync": {
                **sync_info,
                "loadType": result.load_type,
                "lastSyncedAt": datetime.utcnow().isoformat(),
                "trackCount": len(refreshed),
            },
        }
        service = self._playlist_service()
        try:
            await service.save_playlist(guild.id, playlist_name, refreshed, metadata=updated_meta)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Failed to persist refreshed playlist '%s' for guild %s: %s",
                    playlist_name,
                    guild.id,
                    exc,
                )
        return refreshed, updated_meta

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
        changed = False
        trimmed = 0
        if mode in {"smart", "full"}:
            trimmed = self._dedupe_queue(player)
            if trimmed:
                changed = True
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
                changed = True
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
        if changed and self.bot.logger:
            self.bot.logger.info("Automation (%s) adjusted queue for guild %s (%s).", mode, guild_id, event)

    @staticmethod
    def _automation_description(action: str, origin: str, metadata: Dict[str, Any]) -> str:
        if action == "queue_trim":
            removed_val = metadata.get("removed")
            removed = int(removed_val) if removed_val is not None else 0
            return f"Removed {removed} duplicate track(s) during {origin}."
        if action == "auto_restart":
            queue_length = metadata.get("queueLength")
            return f"Restarted playback automatically via {origin} ({queue_length} track(s) queued)."
        if action == "command_throttled":
            retry = metadata.get("retryAfter")
            command = metadata.get("command") or origin
            retry_val = float(retry) if retry is not None else 0.0
            return f"Throttled `{command}` for {int(retry_val)}s to protect shard capacity."
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

    async def _playlist_plan_state(self, guild_id: int) -> tuple[str, int]:
        service = self._settings_service()
        if not service:
            return "free", PLAYLIST_STORAGE_LIMITS["free"]
        state = await service.get_settings(guild_id)
        tier = (state.tier or "free").lower()
        cap = PLAYLIST_STORAGE_LIMITS.get(tier, PLAYLIST_STORAGE_LIMITS["starter"])
        return tier, cap

    @staticmethod
    def _queue_limit_message(capacity: QueueCapacity) -> str:
        if capacity.remaining <= 0:
            return (
                f"The queue already has `{capacity.limit}` tracks. "
                "Remove some tracks or upgrade your plan in the control panel."
            )
        return (
            f"Only `{capacity.remaining}` queue slot(s) remain on this plan (limit `{capacity.limit}`). "
            "Load fewer tracks or increase the plan tier to continue."
        )

    @staticmethod
    def _ensure_manage_guild(inter: discord.Interaction) -> Optional[str]:
        """Ensure the invoking member can manage the guild."""
        if not inter.guild:
            return "This command can only be used inside a guild."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if not member.guild_permissions.manage_guild:
            return "You must have the `Manage Server` permission to perform this action."
        return None

    @app_commands.command(name="queue", description="Show the current queue with details.")
    async def queue(self, inter: discord.Interaction) -> None:
        """Display the queue using an embed paginator."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            error_embed = factory.error("Guild only command.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)
            return

        items: List[str] = []
        if player.current:
            items.append(f"`Now` {track_str(player.current)}")
        items.extend(track_str(track) for track in player.queue)

        paginator = EmbedPaginator(
            entries=items,
            per_page=10,
            guild_id=inter.guild.id if inter.guild else None,
        )
        embed = paginator.make_embed()
        embed.title = "🎶 Queue Overview"
        embed.description = "\n".join(items[:10])
        summary_text = self._queue_summary(player)
        footer_text = embed.footer.text if embed.footer else None
        footer_icon = getattr(embed.footer, "icon_url", None) if embed.footer else None
        if footer_text:
            embed.set_footer(text=f"{footer_text} • {summary_text}", icon_url=footer_icon)
        else:
            embed.set_footer(text=summary_text, icon_url=None)
        await inter.response.send_message(embed=embed, view=paginator, ephemeral=True)

    @app_commands.command(name="remove", description="Remove a track by its 1-based position.")
    @app_commands.describe(index="1-based index in the queue")
    async def remove(self, inter: discord.Interaction, index: app_commands.Range[int, 1, 9999]) -> None:
        """Remove a track from the queue by its displayed index."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "queue_remove"):
            return
        if not inter.guild:
            await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)
            return
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or not player.queue:
            await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)
            return

        idx = index - 1
        if not 0 <= idx < len(player.queue):
            await inter.response.send_message(embed=factory.warning("Index out of range."), ephemeral=True)
            return

        removed = player.queue.pop(idx)
        embed = factory.success("Removed", track_str(removed))
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "queue:remove", details=track_str(removed))
        await self._publish_queue_state(inter.guild.id, player, "queue_remove", {"index": idx})
        await self._apply_automation_rules(inter.guild.id, player, "remove")
        await self._record_compliance(
            inter.guild.id,
            "queue_remove",
            {"index": idx, "track": track_str(removed)},
        )
        await self._record_analytics(
            inter.guild.id,
            "queue_remove",
            {"index": idx, "remaining": len(player.queue)},
        )

    @app_commands.command(name="clear", description="Clear the queue.")
    async def clear(self, inter: discord.Interaction) -> None:
        """Remove every queued track without affecting the currently playing track."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "queue_clear"):
            return
        if not inter.guild:
            await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)
            return
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or not player.queue:
            await inter.response.send_message(embed=factory.warning("Queue is already empty."), ephemeral=True)
            return

        cleared = len(player.queue)
        player.queue.clear()
        embed = factory.success("Queue Cleared", f"Removed **{cleared}** track(s).")
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "queue:clear", details=f"{cleared} tracks removed")
        await self._publish_queue_state(inter.guild.id, player, "queue_clear", {"removed": cleared})
        await self._apply_automation_rules(inter.guild.id, player, "clear")
        await self._record_compliance(inter.guild.id, "queue_clear", {"removed": cleared})
        await self._record_analytics(
            inter.guild.id,
            "queue_clear",
            {"removed": cleared},
        )

    @app_commands.command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, inter: discord.Interaction) -> None:
        """Shuffle the current queue order."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "queue_shuffle"):
            return
        if not inter.guild:
            await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)
            return
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or len(player.queue) < 2:
            warning_embed = factory.warning("Need at least 2 tracks to shuffle.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        shuffle_tracks(player.queue)
        embed = factory.primary("🔀 Shuffled")
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "queue:shuffle", details=f"{len(player.queue)} tracks")
        await self._publish_queue_state(inter.guild.id, player, "queue_shuffle")
        await self._apply_automation_rules(inter.guild.id, player, "shuffle")
        await self._record_compliance(inter.guild.id, "queue_shuffle", {"size": len(player.queue)})
        await self._record_analytics(
            inter.guild.id,
            "queue_shuffle",
            {"size": len(player.queue)},
        )

    @app_commands.command(name="move", description="Move a track within the queue.")
    @app_commands.describe(src="From (1-based)", dest="To (1-based)")
    async def move(
        self,
        inter: discord.Interaction,
        src: app_commands.Range[int, 1, 9999],
        dest: app_commands.Range[int, 1, 9999],
    ) -> None:
        """Reorder a track within the queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "queue_move"):
            return
        if not inter.guild:
            error_embed = factory.error("Guild only command.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or not player.queue:
            warning_embed = factory.warning("Queue is empty.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        src_idx = src - 1
        dest_idx = dest - 1
        if not (0 <= src_idx < len(player.queue) and 0 <= dest_idx < len(player.queue)):
            await inter.response.send_message(embed=factory.warning("Index out of range."), ephemeral=True)
            return

        track = player.queue.pop(src_idx)
        player.queue.insert(dest_idx, track)
        embed = factory.success("Moved", f"`{src}` → `{dest}`")
        embed.add_field(name="Track", value=track_str(track), inline=False)
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._log_dj_action(inter, "queue:move", details=f"{src}->{dest} {track.title}")
        await self._publish_queue_state(inter.guild.id, player, "queue_move", {"from": src, "to": dest})
        await self._apply_automation_rules(inter.guild.id, player, "move")
        await self._record_compliance(
            inter.guild.id,
            "queue_move",
            {"from": src, "to": dest, "track": track_str(track)},
        )
        await self._record_analytics(
            inter.guild.id,
            "queue_move",
            {"from": src, "to": dest},
        )

    @app_commands.command(name="queueinfo", description="Detailed view of the queue with statistics.")
    async def queueinfo(self, inter: discord.Interaction) -> None:
        """Return a concise summary of the queue including statistics."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message("This command can only be used in a guild.", ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)
            return

        total_tracks = len(player.queue)
        total_duration = sum(track.duration or 0 for track in player.queue)

        embed = factory.primary("📋 Queue Information")
        if player.current:
            embed.add_field(name="Now Playing", value=track_str(player.current), inline=False)
            total_duration += max((player.current.duration or 0) - player.position, 0)
        embed.add_field(name="Queued Tracks", value=f"`{total_tracks}`", inline=True)
        embed.add_field(name="Total Duration", value=f"`{ms_to_clock(total_duration)}`", inline=True)
        embed.add_field(name="Loop Mode", value=f"`{getattr(player, 'loop', 0)}`", inline=True)
        embed.add_field(name="Volume", value=f"`{player.volume}%`", inline=True)

        upcoming = self._upcoming_block(player)
        if upcoming:
            embed.add_field(name="Up Next", value=upcoming, inline=False)

        await inter.response.send_message(embed=embed, ephemeral=True)

    def _upcoming_block(self, player: lavalink.DefaultPlayer, limit: int = 10) -> Optional[str]:
        """Render a formatted block for the next upcoming tracks."""
        if not player.queue:
            return None
        lines = []
        for idx, track in enumerate(player.queue[:limit], start=1):
            lines.append(f"`{idx}` {track.title} — {ms_to_clock(track.duration)}")
        if len(player.queue) > limit:
            lines.append(f"...`{len(player.queue) - limit}` more")
        return "\n".join(lines)

    # ------------------------------------------------------------------ playlist management
    playlist = app_commands.Group(
        name="playlist",
        description="Manage persistent playlists for this guild.",
        guild_only=True,
    )

    @playlist.command(name="save", description="Persist the current queue as a named playlist.")
    @app_commands.describe(
        name="Unique playlist name (case-insensitive).",
        include_current="Include the currently playing track in the saved playlist.",
    )
    async def playlist_save(self, inter: discord.Interaction, name: str, include_current: bool = True) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        factory = EmbedFactory(inter.guild.id)
        if not await self._throttle_command(inter, "playlist_save"):
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return

        cleaned = name.strip()
        if not cleaned or len(cleaned) > 64:
            error_embed = factory.error("Playlist name must be 1-64 characters.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            warning_embed = factory.warning("No tracks to persist.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        plan_tier, playlist_cap = await self._playlist_plan_state(inter.guild.id)
        if playlist_cap <= 0:
            upgrade_embed = factory.error(
                "Playlist storage is locked on the Free plan. Upgrade to Starter to sync Redis-backed playlists."
            )
            await inter.response.send_message(embed=upgrade_embed, ephemeral=True)
            return

        tracks: List[lavalink.AudioTrack] = []
        if include_current and player.current:
            tracks.append(player.current)
        tracks.extend(player.queue)

        service = self._playlist_service()
        try:
            existing_names = await service.list_playlists(inter.guild.id)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Failed to list playlists while saving for guild %s: %s",
                    inter.guild.id,
                    exc,
                )
            error_embed = factory.error("Unable to verify playlist storage. Please try again later.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return

        normalised = cleaned.lower()
        existing_lookup = {entry.lower() for entry in existing_names}
        if (
            math.isfinite(playlist_cap)
            and playlist_cap > 0
            and len(existing_names) >= int(playlist_cap)
            and normalised not in existing_lookup
        ):
            limit_label = f"{int(playlist_cap)} playlists"
            warning_embed = factory.error(
                f"{self._plan_label(plan_tier)} plans can store up to {limit_label}. "
                "Delete older playlists or upgrade your plan to persist more.",
            )
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        try:
            count = await service.save_playlist(inter.guild.id, cleaned, tracks)
            if self.bot.logger:
                self.bot.logger.info(
                    "Playlist '%s' saved with %s track(s) for guild %s by user %s",
                    cleaned,
                    count,
                    inter.guild.id,
                    inter.user.id,
                )
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Playlist save failed for '%s' (guild %s, user %s): %s",
                    cleaned,
                    inter.guild.id,
                    inter.user.id,
                    exc,
                )
            error_embed = factory.error("Failed to save playlist. Please try again later.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return
        save_message = f"Stored **{count}** track(s) as `{cleaned}`."
        embed = factory.success("Playlist Saved", save_message)
        embed.add_field(name="Tip", value="Use `/playlist load` to queue the playlist later.", inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)
        await self._record_analytics(
            inter.guild.id,
            "playlist_save",
            {"name": cleaned, "tracks": len(tracks)},
        )

    @playlist.command(name="load", description="Load a saved playlist into the current queue.")
    @app_commands.describe(
        name="Playlist name to load.",
        replace_queue="Clear the existing queue (and stop current track) before loading.",
    )
    async def playlist_load(self, inter: discord.Interaction, name: str, replace_queue: bool = False) -> None:
        if not inter.guild:
            await inter.response.send_message("This command is guild-only.", ephemeral=True)
            return
        factory = EmbedFactory(inter.guild.id)
        if not await self._throttle_command(inter, "playlist_load"):
            return
        if (error := self._require_dj(inter)) is not None:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return

        player = await self._player(inter.guild)
        if not player or not player.is_connected:
            message = (
                "VectoBeat must be connected to voice before loading a playlist. "
                "Use `/connect` first."
            )
            error_embed = factory.error(message)
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return

        plan_tier, playlist_cap = await self._playlist_plan_state(inter.guild.id)
        if playlist_cap <= 0:
            upgrade_embed = factory.error(
                "Playlist storage is available on Starter plans. Upgrade to load saved queues."
            )
            await inter.response.send_message(embed=upgrade_embed, ephemeral=True)
            return

        await inter.response.defer(ephemeral=True)
        progress = SlashProgress(inter, "Playlist Loader")
        await progress.start("Fetching playlist from storage...")

        service = self._playlist_service()
        default_requester = inter.user.id if isinstance(inter.user, discord.User) else None
        cleaned_name = name.strip()
        try:
            tracks, metadata = await service.load_playlist(
                inter.guild.id,
                cleaned_name,
                default_requester=default_requester,
            )
            if self.bot.logger:
                self.bot.logger.info(
                    "Loaded playlist '%s' with %s track(s) for guild %s by user %s",
                    cleaned_name,
                    len(tracks),
                    inter.guild.id,
                    inter.user.id,
                )
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Playlist load failed for '%s' (guild %s, user %s): %s",
                    name,
                    inter.guild.id,
                    inter.user.id,
                    exc,
                )
            error_embed = factory.error("Failed to load playlist from storage. Please try again later.")
            await progress.fail("Failed to load playlist from storage. Please try again later.")
            return

        synced_remote = False
        playlist_sync_allowed = await self._playlist_sync_enabled(inter.guild.id)
        if metadata and metadata.get("sync") and playlist_sync_allowed:
            refreshed_bundle = await self._refresh_synced_playlist(
                inter.guild,
                cleaned_name,
                metadata,
                default_requester,
            )
            if refreshed_bundle:
                tracks, metadata = refreshed_bundle
                synced_remote = True

        if not tracks:
            warning = factory.warning(f"No playlist found with the name `{cleaned_name}`.")
            return await progress.finish(warning)

        await progress.update(f"Loaded **{len(tracks)}** track(s). Updating queue...")
        autop_flag = player.fetch("autoplay_enabled")
        if replace_queue:
            player.queue.clear()
            if player.current:
                if autop_flag is not None:
                    player.store("autoplay_enabled", False)
                try:
                    await player.stop()
                except Exception:
                    pass
                finally:
                    if autop_flag is not None:
                        player.store("autoplay_enabled", autop_flag)

        if inter.guild:
            allowed, capacity = await self._guard_queue_capacity(
                inter.guild.id,
                len(player.queue),
                len(tracks),
            )
            if not allowed and capacity:
                await self._notify_capacity_block(inter.guild.id, capacity)
                await progress.fail(self._queue_limit_message(capacity))
                return

        policy_hint: Optional[str] = None
        settings_service = self._settings_service()
        if inter.guild and settings_service:
            filtered_tracks, allowed_sources, level = await settings_service.filter_tracks_for_guild(
                inter.guild.id,
                tracks,
            )
            if not filtered_tracks:
                await progress.finish(
                    factory.warning(
                        "None of the tracks in this playlist match the allowed sources for this plan."
                    )
                )
                return
            if allowed_sources and len(filtered_tracks) < len(tracks):
                removed = len(tracks) - len(filtered_tracks)
                allowed_text = ", ".join(sorted(src.replace("_", " ").title() for src in allowed_sources))
                plan_label = (level or "free").capitalize()
                policy_hint = (
                    f"Skipped {removed} track(s); {plan_label} plans only allow: {allowed_text}."
                )
            tracks = filtered_tracks

        should_start = not player.is_playing and not player.paused and not player.current

        for track in tracks:
            player.add(track)

        copilot = self._queue_copilot_service()
        copilot_meta: Dict[str, Any] = {}
        if copilot:
            try:
                copilot_meta = await copilot.on_tracks_added(player, tracks, guild_id=inter.guild.id)
            except Exception as exc:  # pragma: no cover - defensive
                bot_logger = getattr(self.bot, "logger", None)
                if bot_logger:
                    bot_logger.debug("Queue copilot failed: %s", exc)

        if should_start:
            player.store("suppress_next_announcement", True)
            await player.play()

        summary = "\n".join(f"`{idx+1}` {track.title}" for idx, track in enumerate(tracks[:5]))
        if len(tracks) > 5:
            summary += f"\n...`{len(tracks) - 5}` more"

        load_message = f"Queued **{len(tracks)}** track(s) from `{name}`."
        embed = factory.success("Playlist Loaded", load_message)
        embed.add_field(name="Preview", value=summary, inline=False)
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        if synced_remote and metadata and isinstance(metadata.get("sync"), dict):
            source = metadata["sync"].get("source")
            if isinstance(source, str) and source:
                embed.add_field(name="Sync Source", value=source, inline=False)
        if policy_hint:
            embed.add_field(name="Source Policy", value=policy_hint, inline=False)
        await progress.finish(embed)
        await self._log_dj_action(
            inter,
            "playlist:load",
            details=f"{name} ({len(tracks)} tracks, replace={'yes' if replace_queue else 'no'})",
        )
        meta: Dict[str, Any] = {"tracks": len(tracks)}
        if copilot_meta.get("actions"):
            meta["copilot"] = copilot_meta
        await self._publish_queue_state(inter.guild.id, player, "playlist_load", meta)
        await self._apply_automation_rules(inter.guild.id, player, "playlist_load")
        await self._record_compliance(
            inter.guild.id,
            "playlist_load",
            {"name": name, "tracks": len(tracks), "replace": replace_queue},
        )

    @playlist.command(name="sync", description="Link a saved playlist to an external URL.")
    @app_commands.describe(
        name="Playlist name to create or update.",
        source_url="External playlist URL (YouTube/Spotify/etc.)",
    )
    async def playlist_sync(self, inter: discord.Interaction, name: str, source_url: str) -> None:
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if inter.guild and not await self._throttle_command(inter, "playlist_sync"):
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        if not inter.guild:
            await inter.response.send_message("This command is guild-only.", ephemeral=True)
            return

        cleaned = name.strip()
        if not cleaned or len(cleaned) > 64:
            await inter.response.send_message(
                embed=factory.error("Playlist name must be 1-64 characters."), ephemeral=True
            )

        if not await self._playlist_sync_enabled(inter.guild.id):
            message = (
                "Playlist sync is disabled for this guild. Enable it in the control panel (Starter plan or higher)."
            )
            await inter.response.send_message(embed=factory.error(message), ephemeral=True)
            return

        normalised_url = source_url.strip()
        if not self._looks_like_url(normalised_url):
            await inter.response.send_message(
                embed=factory.error("Enter a valid HTTP or HTTPS playlist URL."), ephemeral=True
            )

        plan_tier, playlist_cap = await self._playlist_plan_state(inter.guild.id)
        if playlist_cap <= 0:
            upgrade_embed = factory.error(
                "Playlist storage is locked for Free plans. Upgrade to Starter to link remote playlists."
            )
            await inter.response.send_message(embed=upgrade_embed, ephemeral=True)
            return

        service = self._playlist_service()
        try:
            existing_names = await service.list_playlists(inter.guild.id)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Failed to list playlists while syncing for guild %s: %s",
                    inter.guild.id,
                    exc,
                )
            await inter.response.send_message(
                embed=factory.error("Unable to verify playlist storage right now."), ephemeral=True
            )
            return

        normalised = cleaned.lower()
        existing_lookup = {entry.lower() for entry in existing_names}
        if (
            math.isfinite(playlist_cap)
            and playlist_cap > 0
            and len(existing_names) >= int(playlist_cap)
            and normalised not in existing_lookup
        ):
            limit_label = f"{int(playlist_cap)} playlists"
            warning = factory.error(
                f"{self._plan_label(plan_tier)} plans can store up to {limit_label}. "
                "Delete older playlists or upgrade your plan to add more.",
            )
            await inter.response.send_message(embed=warning, ephemeral=True)
            return

        await inter.response.defer(ephemeral=True)
        progress = SlashProgress(inter, "Playlist Sync")
        await progress.start("Loading remote playlist...")
        try:
            result = await self.bot.lavalink.get_tracks(normalised_url)
        except Exception as exc:  # pragma: no cover - network safeguard
            if self.bot.logger:
                self.bot.logger.error(
                    "Failed fetching remote playlist for guild %s (%s): %s",
                    inter.guild.id,
                    normalised_url,
                    exc,
                )
            return await progress.fail("Unable to reach the provided playlist URL.")

        remote_tracks = list(result.tracks or [])
        if not remote_tracks:
            return await progress.fail("No tracks were returned for that playlist. Provide a playlist URL.")

        requester_id = inter.user.id if isinstance(inter.user, discord.User) else None
        if requester_id:
            for track in remote_tracks:
                track.requester = requester_id

        metadata = {
            "sync": {
                "source": normalised_url,
                "loadType": result.load_type,
                "lastSyncedAt": datetime.utcnow().isoformat(),
                "trackCount": len(remote_tracks),
            }
        }

        try:
            await service.save_playlist(inter.guild.id, cleaned, remote_tracks, metadata=metadata)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Playlist sync save failed for '%s' (guild %s): %s",
                    cleaned,
                    inter.guild.id,
                    exc,
                )
            return await progress.fail("Failed to store the synced playlist. Please try again later.")

        embed = factory.success(
            "Playlist Linked",
            f"`{cleaned}` now mirrors the remote playlist ({len(remote_tracks)} track(s)). Future loads fetch the latest version.",
        )
        embed.add_field(name="Source", value=normalised_url, inline=False)
        await progress.finish(embed)
        await self._record_compliance(
            inter.guild.id,
            "playlist_sync",
            {"name": cleaned, "source": normalised_url, "tracks": len(remote_tracks)},
        )
        await self._record_analytics(
            inter.guild.id,
            "playlist_sync",
            {"name": cleaned, "tracks": len(remote_tracks)},
        )

    @playlist.command(name="list", description="List all saved playlists for this guild.")
    async def playlist_list(self, inter: discord.Interaction):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message("This command is guild-only.", ephemeral=True)
            return

        _, playlist_cap = await self._playlist_plan_state(inter.guild.id)
        if playlist_cap <= 0:
            upgrade_embed = factory.error(
                "Playlist storage is locked for Free plans. Upgrade to Starter to view saved playlists."
            )
            await inter.response.send_message(embed=upgrade_embed, ephemeral=True)
            return

        service = self._playlist_service()
        try:
            names = await service.list_playlists(inter.guild.id)
            if self.bot.logger:
                self.bot.logger.info("Listed %s playlists for guild %s", len(names), inter.guild.id)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error("Failed to list playlists for guild %s: %s", inter.guild.id, exc)
            error_embed = factory.error("Unable to query playlists from storage. Please try again later.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return
        if not names:
            warning_embed = factory.warning("No playlists saved yet.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        embed = factory.primary("Saved Playlists")
        embed.description = "\n".join(f"- `{name}`" for name in names)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @playlist.command(name="delete", description="Remove a saved playlist.")
    async def playlist_delete(self, inter: discord.Interaction, name: str):
        if not inter.guild:
            await inter.response.send_message("Guild only command.", ephemeral=True)
            return
        factory = EmbedFactory(inter.guild.id)
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return

        plan_tier, playlist_cap = await self._playlist_plan_state(inter.guild.id)
        if playlist_cap <= 0:
            upgrade_embed = factory.error(
                "Playlist storage is only available on Starter plans. Upgrade to remove saved playlists."
            )
            await inter.response.send_message(embed=upgrade_embed, ephemeral=True)
            return

        service = self._playlist_service()
        cleaned = name.strip()
        try:
            removed = await service.delete_playlist(inter.guild.id, cleaned)
            if removed and self.bot.logger:
                self.bot.logger.info(
                    "Deleted playlist '%s' for guild %s by user %s",
                    cleaned,
                    inter.guild.id,
                    inter.user.id,
                )
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error(
                    "Playlist delete failed for '%s' (guild %s, user %s): %s",
                    cleaned,
                    inter.guild.id,
                    inter.user.id,
                    exc,
                )
            error_embed = factory.error("Failed to delete playlist from storage. Please try again later.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return
        if not removed:
            warning_embed = factory.warning(f"No playlist found with the name `{cleaned}`.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        embed = factory.success("Playlist Deleted", f"Removed `{cleaned}` from storage.")
        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot) -> None:
    await bot.add_cog(QueueCommands(bot))
