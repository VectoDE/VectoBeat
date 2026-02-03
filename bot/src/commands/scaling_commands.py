"""Slash commands exposing auto-scaling status and manual triggers."""

from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands
from typing import Any, Dict, Optional, TYPE_CHECKING

from src.utils.embeds import EmbedFactory

if TYPE_CHECKING:
    from src.services.scaling_service import ScalingService


def _service(bot: commands.Bot) -> ScalingService:
    svc = getattr(bot, "scaling_service", None)
    if not svc:
        raise RuntimeError("Scaling service not initialised on bot.")
    return svc


class ScalingCommands(commands.Cog):
    """Expose scaling status and allow privileged manual evaluations."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    scaling = app_commands.Group(name="scaling", description="Auto scaling controls", guild_only=True)

    @staticmethod
    def _ensure_admin(inter: discord.Interaction) -> bool:
        if not inter.guild:
            return False
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        return isinstance(member, discord.Member) and member.guild_permissions.administrator

    @scaling.command(name="status", description="Show current scaling metrics and last signal.")
    async def status(self, inter: discord.Interaction) -> None:
        service = _service(self.bot)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        info = service.status()
        embed = factory.primary("Auto Scaling")
        embed.add_field(name="Enabled", value="✅" if info["enabled"] else "❌", inline=True)
        embed.add_field(name="Provider", value=info.get("provider", "n/a"), inline=True)
        embed.add_field(name="Endpoint", value=info.get("endpoint", "n/a"), inline=False)
        payload: Optional[Dict[str, Any]] = info.get("last_payload")
        if payload:
            desired: Dict[str, Any] = payload.get("desired", {})
            metrics: Dict[str, Any] = payload.get("metrics", {})
            embed.add_field(
                name="Last Desired",
                value=f"Shards `{desired.get('shards')}` • Nodes `{desired.get('lavalink_nodes')}`",
                inline=False,
            )
            embed.add_field(
                name="Last Metrics",
                value=f"Guilds `{metrics.get('guilds')}` | Active Players `{metrics.get('active_players')}`",
                inline=False,
            )
        response = info.get("last_response")
        if response:
            embed.add_field(name="Last Response", value=response, inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @scaling.command(name="evaluate", description="Force an immediate scaling evaluation.")
    async def evaluate(self, inter: discord.Interaction) -> None:
        if not self._ensure_admin(inter):
            return await inter.response.send_message("Administrator permission required.", ephemeral=True)
        service = _service(self.bot)
        await inter.response.defer(ephemeral=True)
        payload = await service.evaluate(trigger="manual")
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not payload:
            embed = factory.warning("Scaling", "No scaling action required based on current metrics.")
        else:
            desired = payload.get("desired", {})
            embed = factory.success(
                "Scaling signal queued",
                f"Shards `{desired.get('shards')}` | Lavalink `{desired.get('lavalink_nodes')}`",
            )
        await inter.followup.send(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ScalingCommands(bot))
