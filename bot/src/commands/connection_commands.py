"""Voice connection command set."""

from __future__ import annotations

import asyncio
from typing import Optional

import discord
import lavalink
from discord import app_commands
from discord.ext import commands
from typing import TYPE_CHECKING, cast, Any

if TYPE_CHECKING:
    from src.main import VectoBeat
from lavalink.errors import ClientError

from src.services.lavalink_service import LavalinkVoiceClient
from src.utils.embeds import EmbedFactory

REQUIRED_VOICE_PERMS = ("connect", "speak", "view_channel", "use_voice_activation")
GUILD_ONLY_MSG = "This command can only be used within a guild."


class ConnectionCommands(commands.Cog):
    """Enterprise-ready voice connection controls for VectoBeat."""

    def __init__(self, bot: commands.Bot):
        self.bot: VectoBeat = cast(Any, bot) # type: ignore
        self._connect_lock = asyncio.Lock()

    @staticmethod
    def _channel_info(channel: discord.VoiceChannel | discord.StageChannel) -> str:
        """Return a human friendly description of a voice channel."""
        return (
            f"`{channel.name}` (`{channel.id}`)\n"
            f"Bitrate `{channel.bitrate // 1000} kbps` • "
            f"User limit `{channel.user_limit or '∞'}`"
        )

    def _permissions_summary(
        self, member: discord.Member, channel: discord.VoiceChannel | discord.StageChannel
    ) -> tuple[str, list[str]]:
        """List permission status for required voice capabilities."""
        perms = channel.permissions_for(member)
        lines = []
        missing = []
        for attr in REQUIRED_VOICE_PERMS:
            label = attr.replace("_", " ").title()
            granted = getattr(perms, attr, False)
            icon = "✅" if granted else "❌"
            lines.append(f"{icon} {label}")
            if not granted:
                missing.append(attr)
        return "\n".join(lines), missing

    @staticmethod
    def _find_player(bot: VectoBeat, guild_id: int) -> Optional[lavalink.DefaultPlayer]:
        """Return the Lavalink player associated with the guild."""
        return bot.lavalink.player_manager.get(guild_id)

    async def _ensure_ready(self):
        """Ensure Lavalink nodes are connected before attempting a join."""
        manager = getattr(self.bot, "lavalink_manager", None)
        if manager:
            try:
                await manager.ensure_ready()
            except Exception as exc:  # pragma: no cover - defensive
                logger = getattr(self.bot, "logger", None)
                if logger:
                    logger.debug("Failed to refresh Lavalink nodes: %s", exc)

    # ------------------------------------------------------------------ commands
    async def _configure_player(self, player: lavalink.DefaultPlayer, guild: discord.Guild, channel: discord.abc.GuildChannel) -> None:
        """Apply guild-specific settings to the player after connection."""
        player.store("text_channel_id", channel.id)
        manager = getattr(self.bot, "profile_manager", None)
        settings_service = getattr(self.bot, "server_settings", None)

        if manager:
            profile = manager.get(guild.id)
            player.store("autoplay_enabled", profile.autoplay)
            player.store("announcement_style", profile.announcement_style)
            desired_volume = (
                settings_service.global_default_volume() if settings_service else None
            ) or profile.default_volume

            if player.volume != desired_volume:
                await player.set_volume(desired_volume)

    @app_commands.command(name="connect", description="Connect VectoBeat to your current voice channel.")
    async def connect(self, inter: discord.Interaction) -> None:
        """Connect the bot to the caller's voice channel with diagnostics."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)

        if not inter.guild:
            await inter.response.send_message(GUILD_ONLY_MSG, ephemeral=True)
            return
        assert inter.guild is not None

        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        voice = getattr(member, "voice", None)
        if not member or not voice or not voice.channel:
            error_embed = factory.error("You must be in a voice channel.")
            await inter.response.send_message(embed=error_embed, ephemeral=True)
            return

        async with self._connect_lock:
            await self._ensure_ready()
            
            if not getattr(self, "bot", None):
                return

            player = self._find_player(self.bot, inter.guild.id)
            if player and player.is_connected:
                embed = factory.warning("Already connected.")
                if player.channel_id:
                    vc = inter.client.get_channel(int(player.channel_id))
                    if isinstance(vc, (discord.VoiceChannel, discord.StageChannel)):
                        embed.add_field(name="Channel", value=self._channel_info(vc), inline=False)
                await inter.response.send_message(embed=embed, ephemeral=True)
                return

            if getattr(self.bot, "lavalink", None) and not self.bot.lavalink.node_manager.available_nodes:
                await inter.response.send_message(
                    embed=factory.error("Lavalink node is offline. Please check connectivity."), ephemeral=True
                )
                return

            me = inter.guild.me or inter.guild.get_member(getattr(self.bot.user, "id", 0))
            channel = voice.channel
            if not isinstance(channel, (discord.VoiceChannel, discord.StageChannel)):
                await inter.response.send_message("I can only join standard voice and stage channels.", ephemeral=True)
                return

            if not me:
                await inter.response.send_message("Unable to resolve bot member.", ephemeral=True)
                return

            summary, missing = self._permissions_summary(me, channel)
            if missing:
                missing_lines = "\n".join(f"- {attr.replace('_', ' ').title()}" for attr in missing)
                embed = factory.error(
                    "I am missing voice permissions in this channel:",
                    missing_lines,
                )
                await inter.response.send_message(embed=embed, ephemeral=True)
                return

            try:
                await channel.connect(cls=LavalinkVoiceClient)  # type: ignore[arg-type]
            except ClientError as exc:
                logger = getattr(self.bot, "logger", None)
                if logger:
                    logger.warning("Lavalink not available for guild %s: %s", inter.guild.id, exc)
                await inter.response.send_message(
                    embed=factory.error(
                        "No Lavalink node is currently available. Please ensure the server is running and reachable."
                    ),
                    ephemeral=True,
                )
                return
            except Exception as exc:  # pragma: no cover - defensive
                logger = getattr(self.bot, "logger", None)
                if logger:
                    logger.error("Voice connection failed for guild %s: %s", inter.guild.id, exc)
                await inter.response.send_message(
                    embed=factory.error("Unable to join the voice channel right now. Please try again shortly."),
                    ephemeral=True,
                )
                return
            
            player = self._find_player(self.bot, inter.guild.id)
            if player and isinstance(inter.channel, (discord.TextChannel, discord.VoiceChannel, discord.StageChannel, discord.Thread)):
                await self._configure_player(player, inter.guild, inter.channel)  # type: ignore

            connection_details = f"Joined voice channel:\n{self._channel_info(channel)}"
            embed = factory.success("Connected", connection_details)
            embed.add_field(name="Permissions", value=summary, inline=False)
            await inter.response.send_message(embed=embed)

    @app_commands.command(name="disconnect", description="Disconnect VectoBeat from the voice channel.")
    async def disconnect(self, inter: discord.Interaction) -> None:
        """Disconnect from voice and destroy the Lavalink player."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(GUILD_ONLY_MSG, ephemeral=True)
            return

        voice_client = inter.guild.voice_client
        player = self._find_player(self.bot, inter.guild.id)

        if not voice_client and not player:
            await inter.response.send_message(
                embed=factory.warning("VectoBeat is not connected."),
                ephemeral=True,
            )
            return

        details = []
        if voice_client:
            if getattr(voice_client, "channel", None):
                cname = getattr(voice_client.channel, "name", "Voice Channel")
                details.append(f"Left `{cname}`")
            await voice_client.disconnect(force=False)

        if player:
            await player.stop()
            await self.bot.lavalink.player_manager.destroy(inter.guild.id)
            details.append("Cleared Lavalink player and queue")

        embed = factory.success("Disconnected", "\n".join(details) or "Voice session terminated.")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="voiceinfo", description="Show VectoBeat's current voice connection status.")
    async def voiceinfo(self, inter: discord.Interaction) -> None:
        """Display diagnostics for the current voice session."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            await inter.response.send_message(GUILD_ONLY_MSG, ephemeral=True)
            return

        player = self._find_player(self.bot, inter.guild.id)
        voice_client = inter.guild.voice_client

        if not player or not player.is_connected or not voice_client:
            warning_embed = factory.warning("VectoBeat is not connected.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return
            
        channel = getattr(voice_client, "channel", None)
        if not channel:
            warning_embed = factory.warning("VectoBeat is disconnected.")
            await inter.response.send_message(embed=warning_embed, ephemeral=True)
            return

        embed = factory.primary("🔊 Voice Session")
        embed.add_field(name="Channel", value=f"`{channel.name}` (`{channel.id}`)", inline=False)

        latencies = getattr(self.bot, "latencies", [])
        shard_latency = next((lat for sid, lat in latencies if sid == inter.guild.shard_id), getattr(self.bot, "latency", 0))
        embed.add_field(name="Gateway Latency", value=f"`{shard_latency*1000:.2f} ms`", inline=True)
        embed.add_field(name="Players Active", value=f"`{player.is_playing}`", inline=True)
        embed.add_field(name="Queue Size", value=f"`{len(getattr(player, 'queue', []))}`", inline=True)

        me = inter.guild.me or inter.guild.get_member(getattr(self.bot.user, "id", 0))
        if me and isinstance(channel, (discord.VoiceChannel, discord.StageChannel)):
            summary, _ = self._permissions_summary(me, channel)
            embed.add_field(name="Permissions", value=summary, inline=False)

        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ConnectionCommands(bot))
