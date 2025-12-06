"""Music related event listeners used to broadcast playback updates."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

import discord
import lavalink
from discord.ext import commands
from lavalink.events import QueueEndEvent, TrackEndEvent, TrackStartEvent

from src.configs.settings import CONFIG
from src.services.autoplay_service import AutoplayError
from src.services.lavalink_service import VectoPlayer
from src.services.server_settings_service import GuildSettingsState
from src.utils.embeds import EmbedFactory
from src.utils.tracks import source_name

logger = logging.getLogger(__name__)


class MusicEvents(commands.Cog):
    """React to Lavalink events and emit informative embeds."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._fade_tasks: dict[int, asyncio.Task] = {}
        if hasattr(bot, "lavalink"):
            bot.lavalink.add_event_hooks(self)
        self._queue_copilot = getattr(bot, "queue_copilot", None)

    def _telemetry(self):
        return getattr(self.bot, "queue_telemetry", None)

    def _queue_sync_service(self):
        return getattr(self.bot, "queue_sync", None)

    def _alert_service(self):
        return getattr(self.bot, "alerts", None)

    def _analytics_export_service(self):
        return getattr(self.bot, "analytics_export", None)

    async def _publish_queue_state(
        self,
        player: Optional[VectoPlayer],
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        service = self._queue_sync_service()
        if service and player:
            await service.publish_state(player.guild_id, player, reason, metadata=metadata)

    async def _record_compliance(self, player: Optional[VectoPlayer], event: str, details: Dict[str, Any]) -> None:
        service = self._alert_service()
        if service and player:
            await service.record_compliance(player.guild_id, event, details)

    async def _moderator_alert(self, guild_id: int, message: str, **extras: Any) -> None:
        service = self._alert_service()
        if service:
            await service.moderator_alert(guild_id, message, **extras)

    async def _incident_alert(self, guild_id: int, message: str, *, priority: bool = False, **extras: Any) -> None:
        service = self._alert_service()
        if service:
            await service.incident_alert(guild_id, message, priority=priority, **extras)

    async def _notify_capacity_block(self, player: Optional[VectoPlayer], capacity) -> None:
        if not player:
            return
        await self._moderator_alert(
            player.guild_id,
            "Autoplay paused because the queue reached its plan limit.",
            limit=getattr(capacity, "limit", None),
            remaining=getattr(capacity, "remaining", None),
            tier=getattr(capacity, "plan_label", lambda: "Unknown")(),
        )

    async def _record_analytics(self, player: Optional[VectoPlayer], event: str, payload: Dict[str, Any]) -> None:
        service = self._analytics_export_service()
        if service and player:
            await service.record_event(player.guild_id, event, payload)

    async def _emit_queue_event(self, player: VectoPlayer, event: str, payload: dict) -> None:
        service = self._telemetry()
        if not service:
            return
        payload = {**payload, **self._queue_metrics(player)}
        guild = self.bot.get_guild(player.guild_id)
        shard_id = guild.shard_id if guild else None
        await service.emit(event=event, guild_id=player.guild_id, shard_id=shard_id, payload=payload)

    @staticmethod
    def _queue_metrics(player: VectoPlayer) -> Dict[str, Any]:
        queue = list(getattr(player, "queue", []))
        queue_length = len(queue)
        queue_duration = 0
        for track in queue:
            duration = getattr(track, "duration", 0) or 0
            queue_duration += max(0, int(duration))
        return {"queue_length": queue_length, "queue_duration_ms": queue_duration}

    def _requester_name(self, guild: discord.Guild | None, track: lavalink.AudioTrack) -> Optional[str]:
        """Resolve the display name for the requester stored on the track metadata."""
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

    def _channel(self, player: VectoPlayer) -> Optional[discord.abc.Messageable]:
        """Find the message channel associated with a Lavalink player."""
        channel_id = getattr(player, "text_channel_id", None)
        if not channel_id:
            return None
        guild = self.bot.get_guild(player.guild_id)
        if not guild:
            return None
        channel = guild.get_channel(channel_id)
        if isinstance(channel, discord.abc.Messageable):
            return channel
        return None

    # ------------------------------------------------------------------ Crossfade helpers
    def _cancel_fade_task(self, guild_id: int) -> None:
        task = self._fade_tasks.pop(guild_id, None)
        if task and not task.done():
            task.cancel()

    async def _get_server_settings_state(self, player: VectoPlayer) -> Optional[GuildSettingsState]:
        """Fetch the cached server settings for ``player.guild_id``."""
        service = getattr(self.bot, "server_settings", None)
        if not service:
            return None
        try:
            return await service.get_settings(player.guild_id)
        except Exception as exc:  # pragma: no cover - defensive around network/cache errors
            logger.debug("Server settings fetch failed for guild %s: %s", player.guild_id, exc)
            return None

    async def _apply_playback_quality(
        self,
        player: VectoPlayer,
        state: Optional[GuildSettingsState] = None,
        *,
        fetch_if_missing: bool = True,
    ) -> None:
        """Apply playback-quality filters based on the guild's server settings."""
        if state is None and fetch_if_missing:
            state = await self._get_server_settings_state(player)

        quality_source = state.settings if state else {}
        quality = str(quality_source.get("playbackQuality") or "standard").lower()
        cached = player.fetch("playback_quality_mode")
        if cached == quality:
            return

        player.store("playback_quality_mode", quality)
        try:
            if quality == "hires":
                await player.remove_filter(lavalink.LowPass)
                logger.debug("Applied hi-res playback profile for guild %s", player.guild_id)
            else:
                await player.set_filter(lavalink.LowPass(smoothing=20.0))
                logger.debug("Applied standard playback profile for guild %s", player.guild_id)
        except Exception as exc:
            logger.warning("Failed to set playback quality '%s' for guild %s: %s", quality, player.guild_id, exc)

    def _crossfade_enabled(self, state: Optional[GuildSettingsState]) -> bool:
        """Return whether crossfade should be active for the given state."""
        if state and "autoCrossfade" in state.settings:
            return bool(state.settings.get("autoCrossfade"))
        return CONFIG.crossfade.enabled and CONFIG.crossfade.duration_ms > 0

    async def _ramp_volume(self, player: VectoPlayer, start: int, end: int) -> None:
        """Adjust volume gradually from ``start`` to ``end``."""
        steps = max(1, CONFIG.crossfade.fade_steps)
        duration = max(100, CONFIG.crossfade.duration_ms)
        delay = duration / steps / 1000
        delta = (end - start) / steps
        current = start
        for _ in range(steps):
            current += delta
            vol = int(max(0, min(200, current)))
            try:
                await player.set_volume(vol)
            except Exception:
                return
            await asyncio.sleep(delay)

    async def _schedule_fade_out(self, player: VectoPlayer, track: lavalink.AudioTrack):
        """Wait until the end of the track and fade out before transition."""
        duration = getattr(track, "duration", 0) or 0
        fade_ms = min(CONFIG.crossfade.duration_ms, max(0, duration))
        if duration <= fade_ms or fade_ms <= 0:
            return
        identifier = getattr(track, "identifier", None)
        wait = max((duration - fade_ms) / 1000, 0)
        await asyncio.sleep(wait)
        if getattr(player, "current", None) is None or getattr(player.current, "identifier", None) != identifier:
            return
        start_volume = player.volume
        floor = max(0, min(player.volume, CONFIG.crossfade.floor_volume))
        await self._ramp_volume(player, start_volume, floor)
        player.store("crossfade_restore_volume", start_volume)

    @lavalink.listener()
    async def on_track_start(self, event: TrackStartEvent):
        """Announce when a new track begins, unless suppressed by manual play."""
        if not isinstance(event, TrackStartEvent) or not getattr(event, "player", None):
            return

        player: VectoPlayer = event.player  # type: ignore[assignment]
        if player.fetch("suppress_next_announcement", False):
            player.store("suppress_next_announcement", False)
            return

        settings_state = await self._get_server_settings_state(player)
        await self._apply_playback_quality(player, settings_state, fetch_if_missing=False)
        crossfade_enabled = self._crossfade_enabled(settings_state)
        previous_crossfade = bool(player.fetch("auto_crossfade_active"))
        player.store("auto_crossfade_active", crossfade_enabled)

        channel = self._channel(player)
        if not channel:
            return

        if isinstance(channel, discord.abc.GuildChannel):
            guild_id = channel.guild.id
        else:
            guild_id = None
        factory = EmbedFactory(guild_id)
        track = event.track
        guild = channel.guild if isinstance(channel, discord.abc.GuildChannel) else None
        profile_manager = getattr(self.bot, "profile_manager", None)
        announcement_style = player.fetch("announcement_style")
        if announcement_style is None and profile_manager:
            announcement_style = profile_manager.get(player.guild_id).announcement_style
            player.store("announcement_style", announcement_style)
        announcement_style = announcement_style or "rich"

        # Crossfade fade-in and scheduling
        if crossfade_enabled:
            self._cancel_fade_task(player.guild_id)
            restore_volume = player.fetch("crossfade_restore_volume") or player.volume
            current_volume = player.volume
            if current_volume < restore_volume:
                ramp_task = self._ramp_volume(player, current_volume, restore_volume)
                asyncio.create_task(ramp_task)
            fade_task = self._schedule_fade_out(player, track)
            self._fade_tasks[player.guild_id] = asyncio.create_task(fade_task)
        else:
            if previous_crossfade:
                self._cancel_fade_task(player.guild_id)
            player.store("crossfade_restore_volume", None)

        autoplay_service = getattr(self.bot, "autoplay_service", None)
        payload = {
            "title": track.title,
            "author": track.author,
            "identifier": getattr(track, "identifier", ""),
        }
        player.store("last_track_metadata", payload)

        if self._queue_copilot:
            try:
                asyncio.create_task(self._queue_copilot.on_track_start(player, track))
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Queue copilot track_start failed: %s", exc)

        lyrics_payload = None
        lyrics_service = getattr(self.bot, "lyrics_service", None)
        if lyrics_service:
            try:
                lyrics_payload = await lyrics_service.fetch(
                    title=track.title,
                    artist=track.author,
                    duration_ms=getattr(track, "duration", None),
                )
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Lyrics lookup failed for '%s': %s", track.title, exc)
                lyrics_payload = None
        player.store("lyrics_payload", lyrics_payload)

        if autoplay_service:
            try:
                await autoplay_service.record_play(player.guild_id, track)
            except AutoplayError as exc:
                logger.error("Failed recording autoplay history: %s", exc)

        status_api = getattr(self.bot, "status_api", None)
        if status_api:
            status_api.record_stream_event(
                guild_id=player.guild_id,
                track={
                    "title": track.title,
                    "author": track.author,
                    "identifier": getattr(track, "identifier", None),
                    "uri": getattr(track, "uri", None),
                    "duration": getattr(track, "duration", None),
                },
            )

        if announcement_style == "minimal":
            message = f"🎶 **Now playing:** {track.title} — `{track.author}`"
            try:
                await channel.send(message, silent=True, suppress_embeds=True)
            except Exception as exc:
                logger.error("Failed to send minimal now playing message: %s", exc)
            return

        embed = factory.track_card(
            title=track.title,
            author=track.author,
            duration=_fmt(track.duration),
            url=track.uri,
            requester=self._requester_name(guild, track),
            thumbnail=getattr(track, "artwork_url", None),
            footer_extra="🎶 Now playing",
        )
        if lyrics_service and lyrics_payload:
            snippet = lyrics_service.snippet(lyrics_payload, position_ms=0)
            if snippet:
                embed.add_field(name="Lyrics", value=snippet, inline=False)
        try:
            await channel.send(embed=embed, silent=True)
        except Exception as exc:
            logger.error("Failed to send now playing embed: %s", exc)
        await self._emit_queue_event(
            player,
            "play",
            {
                "track": {
                    "title": track.title,
                    "author": track.author,
                    "identifier": getattr(track, "identifier", None),
                    "uri": getattr(track, "uri", None),
                    "duration": getattr(track, "duration", None),
                },
                "requester": getattr(track, "requester", None),
            },
        )
        await self._publish_queue_state(player, "track_start")
        await self._record_compliance(
            player,
            "track_start",
            {
                "title": track.title,
                "author": track.author,
                "identifier": getattr(track, "identifier", None),
            },
        )
        await self._record_analytics(
            player,
            "track_start",
            {"title": track.title, "duration": getattr(track, "duration", 0)},
        )

    @lavalink.listener()
    async def on_queue_end(self, event: QueueEndEvent):
        """Notify the channel when the queue has been exhausted."""
        if not isinstance(event, QueueEndEvent) or not getattr(event, "player", None):
            return

        player: VectoPlayer = event.player  # type: ignore[assignment]
        channel = self._channel(player)
        if not channel:
            return
        self._cancel_fade_task(player.guild_id)

        profile_manager = getattr(self.bot, "profile_manager", None)
        settings_service = getattr(self.bot, "server_settings", None)
        autoplay = player.fetch("autoplay_enabled")
        if autoplay is None and profile_manager:
            autoplay = profile_manager.get(player.guild_id).autoplay
            player.store("autoplay_enabled", autoplay)
        if autoplay:
            plan_label = "current"
            if settings_service:
                ai_allowed = await settings_service.allows_ai_recommendations(player.guild_id)
                plan_label = (await settings_service.tier(player.guild_id)).capitalize() or "Pro"
            else:
                ai_allowed = True
            if not ai_allowed:
                guild_id = channel.guild.id if isinstance(channel, discord.abc.GuildChannel) else None
                factory = EmbedFactory(guild_id)
                try:
                    await channel.send(
                        embed=factory.warning(
                            f"AI-powered autoplay is locked on the {plan_label} plan. Upgrade in the control panel to enable recommendations."
                        ),
                        silent=True,
                    )
                except Exception as exc:
                    logger.error("Failed to send autoplay tier warning: %s", exc)
                await self._moderator_alert(
                    player.guild_id,
                    "Autoplay blocked because the current plan does not include AI recommendations.",
                    tier=plan_label,
                )
                return

            metadata = player.fetch("last_track_metadata") or {}
            artist = metadata.get("author")
            autoplay_service = getattr(self.bot, "autoplay_service", None)
            recommendation: Optional[lavalink.AudioTrack] = None

            if autoplay_service:
                try:
                    recommendation = await autoplay_service.recommend(
                        guild_id=player.guild_id,
                        limit=CONFIG.autoplay.discovery_limit,
                        exclude_identifier=metadata.get("identifier"),
                        artist=artist,
                        requester=getattr(self.bot.user, "id", 0),
                        random_pick=CONFIG.autoplay.random_pick,
                    )
                except AutoplayError as exc:
                    logger.error("Autoplay recommendation failed: %s", exc)

            if not recommendation:
                query_terms = f"{artist or ''} {metadata.get('title', '')}".strip()
                if query_terms:
                    try:
                        search_query = f"ytsearch{CONFIG.autoplay.discovery_limit}:{query_terms}"
                        results = await self.bot.lavalink.get_tracks(search_query)
                    except Exception as exc:  # pragma: no cover - network safeguard
                        logger.error("Autoplay search failed: %s", exc)
                    else:
                        tracks = results.tracks if results else []
                        if tracks:
                            meta_identifier = metadata.get("identifier")
                            recommendation = next(
                                (t for t in tracks if getattr(t, "identifier", None) != meta_identifier),
                                tracks[0],
                            )
                            recommendation.requester = getattr(self.bot.user, "id", 0)

            if recommendation:
                if settings_service:
                    capacity = await settings_service.check_queue_capacity(
                        player.guild_id,
                        existing_tracks=len(player.queue),
                        tracks_to_add=1,
                    )
                    if not capacity.allowed:
                        logger.info(
                            "Skipping autoplay recommendation for guild %s due to queue capacity (limit=%s).",
                            player.guild_id,
                            capacity.limit,
                        )
                        await self._notify_capacity_block(player, capacity)
                        return
                    filtered_tracks, allowed_sources, level = await settings_service.filter_tracks_for_guild(
                        player.guild_id,
                        [recommendation],
                    )
                    if not filtered_tracks:
                        source = source_name(recommendation)
                        logger.info(
                            "Skipping autoplay recommendation for guild %s due to source policy (source=%s, plan=%s).",
                            player.guild_id,
                            source,
                            level,
                        )
                        return
                    recommendation = filtered_tracks[0]
                player.add(recommendation)
                try:
                    await player.play()
                except Exception as exc:  # pragma: no cover - lavalink behaviour
                    logger.error("Failed to start autoplay track: %s", exc)
                else:
                    if isinstance(channel, discord.abc.GuildChannel):
                        guild_id = channel.guild.id
                    else:
                        guild_id = None
                    factory = EmbedFactory(guild_id)
                    bot_logger = getattr(self.bot, "logger", None)
                    if bot_logger:
                        bot_logger.info(
                            "Autoplay queued '%s' (%s) for guild %s",
                            recommendation.title,
                            getattr(recommendation, "identifier", "unknown"),
                            player.guild_id,
                        )
                    try:
                        await channel.send(
                            embed=factory.primary(
                                "Autoplay Continuing",
                                f"Queued **{recommendation.title}** — `{recommendation.author}`",
                            ),
                            silent=True,
                        )
                    except Exception as exc:
                        logger.error("Failed to send autoplay announcement: %s", exc)
                    await self._record_compliance(
                        player,
                        "autoplay_continue",
                        {
                            "title": recommendation.title,
                            "author": recommendation.author,
                            "identifier": getattr(recommendation, "identifier", None),
                        },
                    )
                    return

        if isinstance(channel, discord.abc.GuildChannel):
            guild_id = channel.guild.id
        else:
            guild_id = None
        factory = EmbedFactory(guild_id)
        try:
            queue_message = "Add more tracks with `/play`."
            await channel.send(
                embed=factory.primary("Queue Finished", queue_message),
                silent=True,
            )
        except Exception as exc:
            logger.error("Failed to send queue finished message: %s", exc)
        await self._emit_queue_event(
            player,
            "queue_finished",
            {
                "last_track": player.fetch("last_track_metadata"),
                "autoplay_active": False,
            },
        )
        await self._publish_queue_state(player, "queue_end")
        await self._record_compliance(
            player,
            "queue_finished",
            {"remaining": len(getattr(player, "queue", []))},
        )
        await self._record_analytics(
            player,
            "queue_finished",
            {"remaining": len(getattr(player, "queue", []))},
        )

    @lavalink.listener()
    async def on_track_end(self, event: TrackEndEvent):
        """Report load failures so users understand why playback stopped."""
        if not isinstance(event, TrackEndEvent) or not getattr(event, "player", None):
            return
        player: VectoPlayer = event.player  # type: ignore[assignment]
        self._cancel_fade_task(player.guild_id)

        if event.reason == "LOAD_FAILED":
            channel = self._channel(player)
            if not channel:
                return
            if isinstance(channel, discord.abc.GuildChannel):
                guild_id = channel.guild.id
            else:
                guild_id = None
            factory = EmbedFactory(guild_id)
            try:
                error_embed = factory.error("Failed to play track. The source might be unavailable.")
                await channel.send(embed=error_embed, silent=True)
            except Exception as exc:
                logger.error("Failed to send load failure message: %s", exc)
            track = getattr(player, "current", None)
            track_payload = None
            if track:
                track_payload = {
                    "title": getattr(track, "title", None),
                    "author": getattr(track, "author", None),
                    "identifier": getattr(track, "identifier", None),
                }
            await self._incident_alert(
                player.guild_id,
                "Playback failed to load a track.",
                priority=True,
                track=track_payload,
            )
            await self._record_compliance(
                player,
                "track_load_failed",
                {"track": track_payload},
            )
            await self._record_analytics(
                player,
                "track_load_failed",
                {"track": track_payload},
            )


def _fmt(ms: int) -> str:
    """Helper to convert milliseconds to a readable duration string."""
    seconds = max(0, int(ms // 1000))
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:d}:{sec:02d}"


async def setup(bot: commands.Bot) -> None:
    """Register the cog with the bot."""
    await bot.add_cog(MusicEvents(bot))
