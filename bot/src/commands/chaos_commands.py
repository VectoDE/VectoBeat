"""Slash commands for orchestrating chaos drills."""

from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from typing import TYPE_CHECKING, cast
if TYPE_CHECKING:
    from src.main import VectoBeat

from src.services.chaos_service import ChaosService
from src.utils.embeds import EmbedFactory


def _service(bot: "VectoBeat") -> ChaosService:
    service = getattr(bot, "chaos_service", None)
    if not service:
        raise RuntimeError("Chaos service not initialised.")
    return service


class ChaosCommands(commands.Cog):
    """Allow administrators to trigger or inspect chaos drills."""

    def __init__(self, bot: commands.Bot):
        self.bot = cast("VectoBeat", bot)

    chaos = app_commands.Group(name="chaos", description="Chaos engineering playbook", guild_only=True)

    @staticmethod
    def _ensure_manage_guild(inter: discord.Interaction) -> Optional[str]:
        if not inter.guild:
            return "Guild-only command."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve member."
        if not member.guild_permissions.manage_guild:
            return "You need the `Manage Server` permission."
        return None

    @chaos.command(name="status", description="Show recent chaos drills and schedule info.")
    async def status(self, inter: discord.Interaction) -> None:
        service = _service(self.bot)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.primary("Chaos Playbook")
        embed.add_field(name="Enabled", value="✅" if service.enabled else "❌", inline=True)
        embed.add_field(name="Interval", value=f"`{service.config.interval_minutes} min`", inline=True)
        embed.add_field(name="Scenarios", value=", ".join(service.config.scenarios), inline=False)
        history = service.recent_history()
        if history:
            lines = []
            for scenario, success, details in reversed(history[-5:]):
                icon = "✅" if success else "❌"
                lines.append(f"{icon} `{scenario}` — {details}")
            embed.add_field(name="Recent Drills", value="\n".join(lines), inline=False)
        else:
            embed.add_field(name="Recent Drills", value="_None yet_", inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @chaos.command(name="run", description="Trigger a chaos scenario immediately.")
    @app_commands.describe(scenario="Scenario to run (leave empty for random).")
    async def run(self, inter: discord.Interaction, scenario: Optional[str] = None) -> None:
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        service = _service(self.bot)
        await inter.response.defer(ephemeral=True)
        if scenario:
            result = await service.run_scenario(scenario, triggered_by=inter.user.display_name)
        else:
            result = await service.run_random(inter.user.display_name)
        name, success, details = result
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = (factory.success if success else factory.error)(
            f"Chaos: {name}", details
        )
        await inter.followup.send(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ChaosCommands(bot))
