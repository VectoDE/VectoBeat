from __future__ import annotations

import asyncio
import random
import re
from typing import List, Optional, Tuple

import discord
import lavalink
from discord import app_commands
from discord.ext import commands

from src.services.lavalink_service import LavalinkVoiceClient
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

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # ------------------------------------------------------------------ helpers
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
        return embed

    def _tag_tracks(self, tracks: List[lavalink.AudioTrack], requester: Optional[discord.abc.User]) -> List[lavalink.AudioTrack]:
        """Attach requester metadata to Lavalink track objects."""
        if requester:
            requester_id = requester.id
            for track in tracks:
                track.requester = requester_id
        return tracks

    async def _resolve(self, query: str) -> lavalink.LoadResult:
        query = query.strip()
        if URL_REGEX.match(query):
            result = await self.bot.lavalink.get_tracks(query)
            if result.tracks:
                return result
        last: Optional[lavalink.LoadResult] = None
        for prefix in ("ytsearch", "scsearch", "amsearch"):
            result = await self.bot.lavalink.get_tracks(f"{prefix}:{query}")
            if result.tracks:
                return result
            last = result
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
            await inter.response.send_message(embed=factory.error("Failed to establish Lavalink player."), ephemeral=True)
            return None

        if not player.is_connected:
            for _ in range(20):
                if player.is_connected:
                    break
                await asyncio.sleep(0.1)

        player.text_channel_id = getattr(inter.channel, "id", None)
        return player

    # ------------------------------------------------------------------ commands
    @app_commands.command(name="play", description="Play a song or playlist by search or URL.")
    @app_commands.describe(query="Search query, URL, or playlist link.")
    async def play(self, inter: discord.Interaction, query: str):
        """Queue one or more tracks based on a search query or direct URL."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        await inter.response.defer()

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

        if results.load_type == "PLAYLIST_LOADED":
            selected = tracks
        elif results.load_type == "SEARCH_RESULT":
            count = min(3, len(tracks))
            selected = random.sample(tracks, k=count) if count else tracks[:1]
        else:
            selected = tracks[:1]

        if not selected:
            return await inter.followup.send(embed=factory.warning("No playable tracks found."), ephemeral=True)

        first = selected[0]
        should_start = not player.is_playing and not player.paused and not player.current

        for track in selected:
            player.add(track)

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

        await inter.followup.send(embed=embed)

    @app_commands.command(name="skip", description="Skip the current track.")
    async def skip(self, inter: discord.Interaction):
        """Skip the active track and continue with the next track in queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing to skip."), ephemeral=True)
        await player.skip()
        embed = factory.primary("⏭ Skipped")
        embed.add_field(name="Queue", value=f"`{len(player.queue)}` remaining", inline=True)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, inter: discord.Interaction):
        """Stop playback completely and clear the queue."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        player.queue.clear()
        await player.stop()
        embed = factory.success("Stopped", "Playback ended and queue cleared.")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="pause", description="Pause playback.")
    async def pause(self, inter: discord.Interaction):
        """Pause the player."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        if player.paused:
            return await inter.response.send_message(embed=factory.warning("Already paused."), ephemeral=True)
        await player.set_pause(True)
        embed = factory.primary("⏸️ Paused")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="resume", description="Resume playback.")
    async def resume(self, inter: discord.Interaction):
        """Resume the player if it is paused."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        if not player.paused:
            return await inter.response.send_message(embed=factory.warning("Playback is not paused."), ephemeral=True)
        await player.set_pause(False)
        embed = factory.primary("▶ Resumed")
        embed.add_field(name="Track", value=f"**{player.current.title}**", inline=False)  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)

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
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        await player.set_volume(level)
        embed = factory.primary("🔊 Volume Updated", f"Set to **{level}%**")
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
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player:
            return await inter.response.send_message(embed=factory.warning("Not connected."), ephemeral=True)
        player.loop = mode.value  # type: ignore
        embed = factory.primary("🔁 Loop Mode", f"Loop set to **{mode.name}**")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="seek", description="Seek within the current track (mm:ss).")
    @app_commands.describe(position="Timestamp to seek to, e.g. 1:30")
    async def seek(self, inter: discord.Interaction, position: str):
        """Jump to a specific timestamp within the current track."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
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
                embed=factory.warning("Seek position is beyond track duration."),
                ephemeral=True,
            )

        await player.seek(target)
        embed = factory.primary("⏩ Seeked", f"Jumped to **{position}**")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="replay", description="Restart the current track from the beginning.")
    async def replay(self, inter: discord.Interaction):
        """Restart the current track from the beginning."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if not player or not player.is_playing or not player.current:
            return await inter.response.send_message(embed=factory.warning("Nothing is playing."), ephemeral=True)
        await player.seek(0)
        embed = factory.primary("🔁 Replay", f"Restarted **{player.current.title}**")  # type: ignore
        await inter.response.send_message(embed=embed, ephemeral=True)


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
    async def refresh_button(self, interaction: discord.Interaction, button: discord.ui.Button):  # type: ignore[override]
        """Allow users to refresh the embed on demand."""
        await self.refresh()
        if not interaction.response.is_done():
            await interaction.response.defer()
