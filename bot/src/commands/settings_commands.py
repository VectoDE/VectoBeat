from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import discord
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory

if TYPE_CHECKING:
    from src.services.server_settings_service import ServerSettingsService

MSG_GUILD_ONLY = "This command can only be used inside a guild."


class SettingsCommands(commands.Cog):
    """Slash commands to manage control-panel settings from Discord."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    settings = app_commands.Group(name="settings", description="Manage VectoBeat server settings.")

    def _settings_service(self) -> Optional[ServerSettingsService]:
        return getattr(self.bot, "server_settings", None)

    def _ensure_manage_guild(self, inter: discord.Interaction) -> Optional[str]:
        if not inter.guild:
            return MSG_GUILD_ONLY
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return None
        return "You must have the `Manage Server` permission to update VectoBeat settings."

    async def _prepare_settings_update(self, inter: discord.Interaction) -> Optional[tuple[EmbedFactory, ServerSettingsService]]:
        if not inter.guild:
            await inter.response.send_message(MSG_GUILD_ONLY, ephemeral=True)
            return None

        factory = EmbedFactory(inter.guild.id)
        error = self._ensure_manage_guild(inter)
        if error:
            await inter.response.send_message(embed=factory.error(error), ephemeral=True)
            return None

        service = self._settings_service()
        if not service:
            await inter.response.send_message(
                embed=factory.error("Control panel settings are unavailable."), ephemeral=True
            )
            return None

        await inter.response.defer(ephemeral=True)
        return factory, service

    @settings.command(name="queue-limit", description="Update the maximum queue size (respects plan limits).")
    @app_commands.describe(limit="Desired queue size (Free plan caps at 100 tracks).")
    async def queue_limit(self, inter: discord.Interaction, limit: app_commands.Range[int, 50, 50000]) -> None:
        prep = await self._prepare_settings_update(inter)
        if not prep:
            return
        factory, service = prep
        state = await service.update_settings(inter.guild.id, {"queueLimit": limit})
        if not state:
            await inter.followup.send(embed=factory.error("Failed to persist settings."), ephemeral=True)
            return

        val = state.settings.get("queueLimit", limit)
        applied = int(val) if isinstance(val, (int, float, str)) else limit
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
    async def collaborative(self, inter: discord.Interaction, enabled: bool) -> None:
        prep = await self._prepare_settings_update(inter)
        if not prep:
            return
        factory, service = prep
        state = await service.update_settings(inter.guild.id, {"collaborativeQueue": enabled})
        if not state:
            await inter.followup.send(embed=factory.error("Failed to persist settings."), ephemeral=True)
            return

        status = "enabled" if state.settings.get("collaborativeQueue") else "disabled"
        embed = factory.success("Collaborative queue", f"Collaborative queueing is now **{status}**.")
        embed.add_field(name="Plan", value=state.tier.capitalize(), inline=True)
        await inter.followup.send(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(SettingsCommands(bot))
