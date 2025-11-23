from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory


class SettingsCommands(commands.Cog):
    """Slash commands to manage control-panel settings from Discord."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    settings = app_commands.Group(name="settings", description="Manage VectoBeat server settings.")

    def _settings_service(self):
        return getattr(self.bot, "server_settings", None)

    async def _ensure_manage_guild(self, inter: discord.Interaction) -> Optional[str]:
        if not inter.guild:
            return "This command can only be used inside a guild."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return None
        return "You must have the `Manage Server` permission to update VectoBeat settings."

    @settings.command(name="queue-limit", description="Update the maximum queue size (respects plan limits).")
    @app_commands.describe(limit="Desired queue size (Free plan caps at 100 tracks).")
    async def queue_limit(self, inter: discord.Interaction, limit: app_commands.Range[int, 50, 50000]):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        error = await self._ensure_manage_guild(inter)
        if error:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)

        service = self._settings_service()
        if not service:
            return await inter.response.send_message(
                embed=factory.error("Control panel settings are unavailable."), ephemeral=True
            )

        await inter.response.defer(ephemeral=True)
        state = await service.update_settings(inter.guild.id, {"queueLimit": limit})
        if not state:
            return await inter.followup.send(embed=factory.error("Failed to persist settings."), ephemeral=True)

        applied = int(state.settings.get("queueLimit", limit))
        embed = factory.success("Queue limit updated", f"Queue size capped at **{applied}** tracks.")
        embed.add_field(name="Plan", value=state.tier.capitalize(), inline=True)
        if applied != limit:
            embed.add_field(
                name="Note",
                value="Requested value exceeded this plan's cap; the closest allowed value was applied.",
                inline=False,
            )
        await inter.followup.send(embed=embed, ephemeral=True)

    @settings.command(name="collaborative", description="Enable or disable collaborative queueing.")
    @app_commands.describe(enabled="Allow members without DJ role to add songs.")
    async def collaborative(self, inter: discord.Interaction, enabled: bool):
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        error = await self._ensure_manage_guild(inter)
        if error:
            return await inter.response.send_message(embed=factory.error(error), ephemeral=True)

        service = self._settings_service()
        if not service:
            return await inter.response.send_message(
                embed=factory.error("Control panel settings are unavailable."), ephemeral=True
            )

        await inter.response.defer(ephemeral=True)
        state = await service.update_settings(inter.guild.id, {"collaborativeQueue": enabled})
        if not state:
            return await inter.followup.send(embed=factory.error("Failed to persist settings."), ephemeral=True)

        status = "enabled" if state.settings.get("collaborativeQueue") else "disabled"
        embed = factory.success("Collaborative queue", f"Collaborative queueing is now **{status}**.")
        embed.add_field(name="Plan", value=state.tier.capitalize(), inline=True)
        await inter.followup.send(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(SettingsCommands(bot))
