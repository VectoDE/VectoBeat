"""Voice connection command set."""

from __future__ import annotations

import asyncio
from typing import Optional

import discord
import lavalink
from discord import app_commands
from discord.ext import commands
from lavalink.errors import ClientError

from src.services.lavalink_service import LavalinkVoiceClient
from src.utils.embeds import EmbedFactory

REQUIRED_VOICE_PERMS = ("connect", "speak", "view_channel", "use_voice_activation")


class ConnectionCommands(commands.Cog):
    """Enterprise-ready voice connection controls for VectoBeat."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._connect_lock = asyncio.Lock()

    @staticmethod
    def _channel_info(channel: discord.VoiceChannel) -> str:
        """Return a human friendly description of a voice channel."""
        return (
            f"`{channel.name}` (`{channel.id}`)\n"
            f"Bitrate `{channel.bitrate // 1000} kbps` • "
            f"User limit `{channel.user_limit or '∞'}`"
        )

    def _permissions_summary(
        self, member: discord.Member, channel: discord.VoiceChannel
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
    def _find_player(bot: commands.Bot, guild_id: int) -> Optional[lavalink.DefaultPlayer]:
        """Return the Lavalink player associated with the guild."""
        return bot.lavalink.player_manager.get(guild_id)

    async def _ensure_ready(self):
        """Ensure Lavalink nodes are connected before attempting a join."""
        manager = getattr(self.bot, "lavalink_manager", None)
        if manager:
            try:
                await manager.ensure_ready()
            except Exception as exc:  # pragma: no cover - defensive
                if getattr(self.bot, "logger", None):
                    self.bot.logger.debug("Failed to refresh Lavalink nodes: %s", exc)

    # ------------------------------------------------------------------ commands
    async def _configure_player(self, player: lavalink.DefaultPlayer, guild: discord.Guild, channel: discord.abc.GuildChannel) -> None:
        """Apply guild-specific settings to the player after connection."""
        player.text_channel_id = channel.id
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
            return await inter.response.send_message("This command can only be used within a guild.", ephemeral=True)
        assert inter.guild is not None

        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not member or not member.voice or not member.voice.channel:
            error_embed = factory.error("You must be in a voice channel.")
            return await inter.response.send_message(embed=error_embed, ephemeral=True)

        async with self._connect_lock:
            await self._ensure_ready()

            player = self._find_player(self.bot, inter.guild.id)
            if player and player.is_connected:
                embed = factory.warning("Already connected.")
                embed.add_field(name="Channel", value=self._channel_info(player.channel), inline=False)  # type: ignore
                return await inter.response.send_message(embed=embed, ephemeral=True)

            if not self.bot.lavalink.node_manager.available_nodes:
                return await inter.response.send_message(
                    embed=factory.error("Lavalink node is offline. Please check connectivity."), ephemeral=True
                )

            me = inter.guild.me or inter.guild.get_member(self.bot.user.id)
            channel = member.voice.channel
            if not isinstance(channel, discord.VoiceChannel):
                return await inter.response.send_message("I can only join standard voice channels.", ephemeral=True)

            if not me:
                return await inter.response.send_message("Unable to resolve bot member.", ephemeral=True)

            summary, missing = self._permissions_summary(me, channel)
            if missing:
                missing_lines = "\n".join(f"- {attr.replace('_', ' ').title()}" for attr in missing)
                embed = factory.error(
                    "I am missing voice permissions in this channel:",
                    missing_lines,
                )
                return await inter.response.send_message(embed=embed, ephemeral=True)

            try:
                await channel.connect(cls=LavalinkVoiceClient)  # type: ignore[arg-type]
            except ClientError as exc:
                if getattr(self.bot, "logger", None):
                    self.bot.logger.warning("Lavalink not available for guild %s: %s", inter.guild.id, exc)
                return await inter.response.send_message(
                    embed=factory.error(
                        "No Lavalink node is currently available. Please ensure the server is running and reachable."
                    ),
                    ephemeral=True,
                )
            except Exception as exc:  # pragma: no cover - defensive
                if getattr(self.bot, "logger", None):
                    self.bot.logger.error("Voice connection failed for guild %s: %s", inter.guild.id, exc)
                return await inter.response.send_message(
                    embed=factory.error("Unable to join the voice channel right now. Please try again shortly."),
                    ephemeral=True,
                )
            
            player = self._find_player(self.bot, inter.guild.id)
            if player:
                await self._configure_player(player, inter.guild, inter.channel)

            connection_details = f"Joined voice channel:\n{self._channel_info(channel)}"
            embed = factory.success("Connected", connection_details)
            embed.add_field(name="Permissions", value=summary, inline=False)
            await inter.response.send_message(embed=embed)

    @app_commands.command(name="disconnect", description="Disconnect VectoBeat from the voice channel.")
    async def disconnect(self, inter: discord.Interaction) -> None:
        """Disconnect from voice and destroy the Lavalink player."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message("This command can only be used within a guild.", ephemeral=True)

        voice_client = inter.guild.voice_client
        player = self._find_player(self.bot, inter.guild.id)

        if not voice_client and not player:
            return await inter.response.send_message(
                embed=factory.warning("VectoBeat is not connected."),
                ephemeral=True,
            )

        details = []
        if voice_client:
            details.append(f"Left `{voice_client.channel.name}`")
            await voice_client.disconnect()

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
            return await inter.response.send_message("This command can only be used within a guild.", ephemeral=True)

        player = self._find_player(self.bot, inter.guild.id)
        voice_client = inter.guild.voice_client

        if not player or not player.is_connected or not voice_client:
            warning_embed = factory.warning("VectoBeat is not connected.")
            return await inter.response.send_message(embed=warning_embed, ephemeral=True)

        embed = factory.primary("🔊 Voice Session")
        channel = voice_client.channel  # type: ignore
        embed.add_field(name="Channel", value=self._channel_info(channel), inline=False)

        latencies = getattr(self.bot, "latencies", [])
        shard_latency = next((lat for sid, lat in latencies if sid == inter.guild.shard_id), self.bot.latency)
        embed.add_field(name="Gateway Latency", value=f"`{shard_latency*1000:.2f} ms`", inline=True)
        embed.add_field(name="Players Active", value=f"`{player.is_playing}`", inline=True)
        embed.add_field(name="Queue Size", value=f"`{len(player.queue)}`", inline=True)

        summary, _ = self._permissions_summary(inter.guild.me, channel)  # type: ignore[arg-type]
        embed.add_field(name="Permissions", value=summary, inline=False)

        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ConnectionCommands(bot))
