from __future__ import annotations

import random
from typing import List, Optional

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.services.playlist_service import PlaylistService, PlaylistStorageError
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

    def _playlist_service(self) -> PlaylistService:
        service = getattr(self.bot, "playlist_service", None)
        if not service:
            raise RuntimeError("PlaylistService not initialised on bot.")
        return service

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
    async def move(
        self,
        inter: discord.Interaction,
        src: app_commands.Range[int, 1, 9999],
        dest: app_commands.Range[int, 1, 9999],
    ):
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
    async def playlist_save(self, inter: discord.Interaction, name: str, include_current: bool = True):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)

        cleaned = name.strip()
        if not cleaned or len(cleaned) > 64:
            error_embed = factory.error("Playlist name must be 1-64 characters.")
            return await inter.response.send_message(embed=error_embed, ephemeral=True)

        player = self._player(inter.guild)
        if not player or (not player.queue and not player.current):
            warning_embed = factory.warning("No tracks to persist.")
            return await inter.response.send_message(embed=warning_embed, ephemeral=True)

        tracks: List[lavalink.AudioTrack] = []
        if include_current and player.current:
            tracks.append(player.current)
        tracks.extend(player.queue)

        service = self._playlist_service()
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
            return await inter.response.send_message(embed=error_embed, ephemeral=True)
        save_message = f"Stored **{count}** track(s) as `{cleaned}`."
        embed = factory.success("Playlist Saved", save_message)
        embed.add_field(name="Tip", value="Use `/playlist load` to queue the playlist later.", inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @playlist.command(name="load", description="Load a saved playlist into the current queue.")
    @app_commands.describe(
        name="Playlist name to load.",
        replace_queue="Clear the existing queue (and stop current track) before loading.",
    )
    async def playlist_load(self, inter: discord.Interaction, name: str, replace_queue: bool = False):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message("This command is guild-only.", ephemeral=True)

        player = self._player(inter.guild)
        if not player or not player.is_connected:
            message = (
                "VectoBeat must be connected to voice before loading a playlist. "
                "Use `/connect` first."
            )
            error_embed = factory.error(message)
            return await inter.response.send_message(embed=error_embed, ephemeral=True)

        await inter.response.defer(ephemeral=True)

        service = self._playlist_service()
        default_requester = inter.user.id if isinstance(inter.user, discord.User) else None
        try:
            tracks = await service.load_playlist(
                inter.guild.id,
                name.strip(),
                default_requester=default_requester,
            )
            if self.bot.logger:
                self.bot.logger.info(
                    "Loaded playlist '%s' with %s track(s) for guild %s by user %s",
                    name,
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
            return await inter.followup.send(embed=error_embed, ephemeral=True)
        if not tracks:
            warning = factory.warning(f"No playlist found with the name `{name}`.")
            return await inter.followup.send(embed=warning, ephemeral=True)

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

        should_start = not player.is_playing and not player.paused and not player.current

        for track in tracks:
            player.add(track)

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
        await inter.followup.send(embed=embed, ephemeral=True)

    @playlist.command(name="list", description="List all saved playlists for this guild.")
    async def playlist_list(self, inter: discord.Interaction):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message("This command is guild-only.", ephemeral=True)

        service = self._playlist_service()
        try:
            names = await service.list_playlists(inter.guild.id)
            if self.bot.logger:
                self.bot.logger.info("Listed %s playlists for guild %s", len(names), inter.guild.id)
        except PlaylistStorageError as exc:
            if self.bot.logger:
                self.bot.logger.error("Failed to list playlists for guild %s: %s", inter.guild.id, exc)
            error_embed = factory.error("Unable to query playlists from storage. Please try again later.")
            return await inter.response.send_message(embed=error_embed, ephemeral=True)
        if not names:
            warning_embed = factory.warning("No playlists saved yet.")
            return await inter.response.send_message(embed=warning_embed, ephemeral=True)

        embed = factory.primary("Saved Playlists")
        embed.description = "\n".join(f"- `{name}`" for name in names)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @playlist.command(name="delete", description="Remove a saved playlist.")
    async def playlist_delete(self, inter: discord.Interaction, name: str):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)

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
            return await inter.response.send_message(embed=error_embed, ephemeral=True)
        if not removed:
            warning_embed = factory.warning(f"No playlist found with the name `{cleaned}`.")
            return await inter.response.send_message(embed=warning_embed, ephemeral=True)

        embed = factory.success("Playlist Deleted", f"Removed `{cleaned}` from storage.")
        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(QueueCommands(bot))
