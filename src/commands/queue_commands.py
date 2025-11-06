from __future__ import annotations

import random
from typing import List, Optional

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory
from src.utils.pagination import EmbedPaginator


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


class QueueCommands(commands.Cog):
    """Queue management commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    def _player(self, guild: discord.Guild) -> Optional[lavalink.DefaultPlayer]:
        """Fetch the guild-specific Lavalink player instance."""
        return self.bot.lavalink.player_manager.get(guild.id)

    def _queue_summary(self, player: lavalink.DefaultPlayer) -> str:
        """Summarise queue length and remaining playtime."""
        total_tracks = len(player.queue)
        duration = sum(track.duration or 0 for track in player.queue)
        duration += max((player.current.duration - player.position) if player.current else 0, 0)
        return f"`{total_tracks}` tracks • `{ms_to_clock(duration)}` remaining"

    @app_commands.command(name="queue", description="Show the current queue with details.")
    async def queue(self, inter: discord.Interaction):
        """Display the queue using an embed paginator."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)

        player = self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            return await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)

        items: List[str] = []
        if player.current:
            items.append(f"`Now` {track_str(player.current)}")
        items.extend(track_str(track) for track in player.queue)

        paginator = EmbedPaginator(entries=items, per_page=10, guild_id=inter.guild.id if inter.guild else None)
        embed = paginator.make_embed()
        embed.title = "🎶 Queue Overview"
        embed.description = "\n".join(items[:10])
        embed.set_footer(
            text=f"{embed.footer.text} • {self._queue_summary(player)}" if embed.footer and embed.footer.text else self._queue_summary(player)
        )
        await inter.response.send_message(embed=embed, view=paginator, ephemeral=True)

    @app_commands.command(name="remove", description="Remove a track by its 1-based position.")
    @app_commands.describe(index="1-based index in the queue")
    async def remove(self, inter: discord.Interaction, index: app_commands.Range[int, 1, 9999]):
        """Remove a track from the queue by its displayed index."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)

        player = self._player(inter.guild)
        if not player or not player.queue:
            return await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)

        idx = index - 1
        if not 0 <= idx < len(player.queue):
            return await inter.response.send_message(embed=factory.warning("Index out of range."), ephemeral=True)

        removed = player.queue.pop(idx)
        embed = factory.success("Removed", track_str(removed))
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="clear", description="Clear the queue.")
    async def clear(self, inter: discord.Interaction):
        """Remove every queued track without affecting the currently playing track."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)

        player = self._player(inter.guild)
        if not player or not player.queue:
            return await inter.response.send_message(embed=factory.warning("Queue is already empty."), ephemeral=True)

        cleared = len(player.queue)
        player.queue.clear()
        embed = factory.success("Queue Cleared", f"Removed **{cleared}** track(s).")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, inter: discord.Interaction):
        """Shuffle the current queue order."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)

        player = self._player(inter.guild)
        if not player or len(player.queue) < 2:
            return await inter.response.send_message(embed=factory.warning("Need at least 2 tracks to shuffle."), ephemeral=True)

        random.shuffle(player.queue)
        embed = factory.primary("🔀 Shuffled")
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="move", description="Move a track within the queue.")
    @app_commands.describe(src="From (1-based)", dest="To (1-based)")
    async def move(self, inter: discord.Interaction, src: app_commands.Range[int, 1, 9999], dest: app_commands.Range[int, 1, 9999]):
        """Reorder a track within the queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message(embed=factory.error("Guild only command."), ephemeral=True)

        player = self._player(inter.guild)
        if not player or not player.queue:
            return await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)

        src_idx = src - 1
        dest_idx = dest - 1
        if not (0 <= src_idx < len(player.queue) and 0 <= dest_idx < len(player.queue)):
            return await inter.response.send_message(embed=factory.warning("Index out of range."), ephemeral=True)

        track = player.queue.pop(src_idx)
        player.queue.insert(dest_idx, track)
        embed = factory.success("Moved", f"`{src}` → `{dest}`")
        embed.add_field(name="Track", value=track_str(track), inline=False)
        embed.add_field(name="Queue Summary", value=self._queue_summary(player), inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="queueinfo", description="Detailed view of the queue with statistics.")
    async def queueinfo(self, inter: discord.Interaction):
        """Return a concise summary of the queue including statistics."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message("This command can only be used in a guild.", ephemeral=True)

        player = self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            return await inter.response.send_message(embed=factory.warning("Queue is empty."), ephemeral=True)

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


async def setup(bot):
    await bot.add_cog(QueueCommands(bot))
