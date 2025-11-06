"""Slash commands for managing per-guild playback profiles."""

from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from src.services.profile_service import GuildProfileManager
from src.utils.embeds import EmbedFactory


def _manager(bot: commands.Bot) -> GuildProfileManager:
    manager = getattr(bot, "profile_manager", None)
    if not manager:
        raise RuntimeError("GuildProfileManager not initialised on bot.")
    return manager


class ProfileCommands(commands.Cog):
    """Expose guild-level configuration toggles for playback behaviour."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    profile = app_commands.Group(
        name="profile",
        description="Inspect and configure the guild playback profile.",
        guild_only=True,
    )

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _ensure_manage_guild(inter: discord.Interaction) -> Optional[str]:
        """Verify the invoker has manage_guild permissions."""
        if not inter.guild:
            return "This command can only be used inside a guild."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if not member.guild_permissions.manage_guild:
            return "You require the `Manage Server` permission to modify playback profiles."
        return None

    @staticmethod
    def _profile_embed(inter: discord.Interaction, profile) -> discord.Embed:
        """Build a concise embed representing the guild profile."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.primary("Playback Profile")
        embed.add_field(name="Default Volume", value=f"`{profile.default_volume}%`", inline=True)
        embed.add_field(name="Autoplay", value="✅ Enabled" if profile.autoplay else "❌ Disabled", inline=True)
        embed.add_field(name="Announcement Style", value=f"`{profile.announcement_style}`", inline=True)
        embed.set_footer(text="Use /profile commands to adjust these defaults.")
        return embed

    # ------------------------------------------------------------------ slash commands
    @profile.command(name="show", description="Display the current playback profile for this guild.")
    async def show(self, inter: discord.Interaction):
        profile = _manager(self.bot).get(inter.guild.id)  # type: ignore[union-attr]
        await inter.response.send_message(embed=self._profile_embed(inter, profile), ephemeral=True)

    @profile.command(name="set-volume", description="Set the default playback volume for this guild.")
    @app_commands.describe(level="Volume percent to apply automatically (0-200).")
    async def set_volume(self, inter: discord.Interaction, level: app_commands.Range[int, 0, 200]):
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        manager = _manager(self.bot)
        profile = manager.update(inter.guild.id, volume=level)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            await player.set_volume(profile.default_volume)

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )

    @profile.command(name="set-autoplay", description="Enable or disable autoplay when the queue finishes.")
    async def set_autoplay(self, inter: discord.Interaction, enabled: bool):
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        manager = _manager(self.bot)
        profile = manager.update(inter.guild.id, autoplay=enabled)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            player.store("autoplay_enabled", profile.autoplay)

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )

    @profile.command(name="set-announcement", description="Choose how now-playing messages are displayed.")
    @app_commands.describe(style="Select between rich embeds or minimal text notifications.")
    @app_commands.choices(
        style=[
            app_commands.Choice(name="Rich Embed", value="rich"),
            app_commands.Choice(name="Minimal Text", value="minimal"),
        ]
    )
    async def set_announcement(self, inter: discord.Interaction, style: app_commands.Choice[str]):
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        manager = _manager(self.bot)
        profile = manager.update(inter.guild.id, announcement_style=style.value)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            player.store("announcement_style", profile.announcement_style)

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )


async def setup(bot: commands.Bot):
    await bot.add_cog(ProfileCommands(bot))
