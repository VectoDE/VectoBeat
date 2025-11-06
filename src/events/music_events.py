"""Music related event listeners used to broadcast playback updates."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import discord
import lavalink
from discord.ext import commands
from lavalink.events import QueueEndEvent, TrackEndEvent, TrackStartEvent

from src.configs.settings import CONFIG
from src.services.autoplay_service import AutoplayError
from src.services.lavalink_service import VectoPlayer
from src.utils.embeds import EmbedFactory

logger = logging.getLogger(__name__)


class MusicEvents(commands.Cog):
    """React to Lavalink events and emit informative embeds."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._fade_tasks: dict[int, asyncio.Task] = {}
        if hasattr(bot, "lavalink"):
            bot.lavalink.add_event_hooks(self)

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
        if CONFIG.crossfade.enabled:
            self._cancel_fade_task(player.guild_id)
            restore_volume = player.fetch("crossfade_restore_volume") or player.volume
            current_volume = player.volume
            if current_volume < restore_volume:
                ramp_task = self._ramp_volume(player, current_volume, restore_volume)
                asyncio.create_task(ramp_task)
            fade_task = self._schedule_fade_out(player, track)
            self._fade_tasks[player.guild_id] = asyncio.create_task(fade_task)

        autoplay_service = getattr(self.bot, "autoplay_service", None)
        payload = {
            "title": track.title,
            "author": track.author,
            "identifier": getattr(track, "identifier", ""),
        }
        player.store("last_track_metadata", payload)

        if autoplay_service:
            try:
                await autoplay_service.record_play(player.guild_id, track)
            except AutoplayError as exc:
                logger.error("Failed recording autoplay history: %s", exc)

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
        try:
            await channel.send(embed=embed, silent=True)
        except Exception as exc:
            logger.error("Failed to send now playing embed: %s", exc)

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
        autoplay = player.fetch("autoplay_enabled")
        if autoplay is None and profile_manager:
            autoplay = profile_manager.get(player.guild_id).autoplay
            player.store("autoplay_enabled", autoplay)
        if autoplay:
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
                    return

        factory = EmbedFactory(getattr(channel.guild, "id", None) if isinstance(channel, discord.abc.GuildChannel) else None)
        try:
            await channel.send(embed=factory.primary("Queue Finished", "Add more tracks with `/play`."), silent=True)
        except Exception as exc:
            logger.error("Failed to send queue finished message: %s", exc)

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
            factory = EmbedFactory(getattr(channel.guild, "id", None) if isinstance(channel, discord.abc.GuildChannel) else None)
            try:
                await channel.send(embed=factory.error("Failed to play track. The source might be unavailable."), silent=True)
            except Exception as exc:
                logger.error("Failed to send load failure message: %s", exc)


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
