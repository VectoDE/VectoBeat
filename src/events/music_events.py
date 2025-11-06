"""Music related event listeners used to broadcast playback updates."""

from __future__ import annotations

import logging
from typing import Optional

import discord
import lavalink
from discord.ext import commands
from lavalink.events import QueueEndEvent, TrackEndEvent, TrackStartEvent

from src.services.lavalink_service import VectoPlayer
from src.utils.embeds import EmbedFactory

logger = logging.getLogger(__name__)


class MusicEvents(commands.Cog):
    """React to Lavalink events and emit informative embeds."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
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

        factory = EmbedFactory(getattr(channel.guild, "id", None) if isinstance(channel, discord.abc.GuildChannel) else None)
        track = event.track
        guild = channel.guild if isinstance(channel, discord.abc.GuildChannel) else None
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

        if event.reason == "LOAD_FAILED":
            player: VectoPlayer = event.player  # type: ignore[assignment]
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
