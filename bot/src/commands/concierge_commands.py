"\"\"\"Concierge desk slash commands with scoped permissions.\"\"\""

from __future__ import annotations

from typing import Any, Dict, Optional

import discord
from discord import app_commands
from discord.ext import commands

from src.services.concierge_service import ConciergeService
from src.utils.embeds import EmbedFactory
from src.utils.security import SensitiveScope, has_scope, log_sensitive_action

GROWTH_PLUS = {"growth", "scale", "enterprise"}


def _service(bot: commands.Bot) -> ConciergeService:
    svc = getattr(bot, "concierge", None)
    if not svc:
        raise RuntimeError("Concierge service not configured.")
    return svc


class ConciergeCommands(commands.Cog):
    """Expose concierge request + staff tooling."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    concierge = app_commands.Group(name="concierge", description="Concierge desk controls", guild_only=True)

    async def _ensure_growth_plan(self, inter: discord.Interaction) -> bool:
        settings = getattr(self.bot, "server_settings", None)
        if not settings or not inter.guild:
            return True
        try:
            tier = await settings.tier(inter.guild.id)
        except Exception:
            tier = "free"
        if tier.lower() not in GROWTH_PLUS:
            await inter.response.send_message(
                "Concierge access requires an active **Growth** or **Scale** plan.",
                ephemeral=True,
            )
            return False
        return True

    def _is_staff(self, inter: discord.Interaction) -> bool:
        user = inter.user if isinstance(inter.user, discord.abc.User) else None
        if has_scope(user, SensitiveScope.CONCIERGE):
            return True
        if not inter.guild or not user:
            return False
        member = inter.guild.get_member(user.id)
        return bool(member and member.guild_permissions.manage_guild)

    def _log(self, inter: discord.Interaction, action: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        log_sensitive_action(
            self.bot,
            scope=SensitiveScope.CONCIERGE,
            action=action,
            guild=inter.guild,
            user=inter.user if isinstance(inter.user, discord.abc.User) else None,
            metadata=metadata,
        )

    @concierge.command(name="request", description="Request concierge assistance for migrations or incidents.")
    @app_commands.describe(
        contact="Email/handle where the concierge can reach you.",
        summary="What do you need help with?",
        hours="Number of hours you expect to need (integer).",
    )
    async def request(self, inter: discord.Interaction, contact: str, summary: str, hours: app_commands.Range[int, 1, 24]) -> None:
        if not await self._ensure_growth_plan(inter):
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Concierge integration is temporarily unavailable.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        result = await service.create_request(
            inter.guild.id if inter.guild else 0,
            contact=contact,
            summary=summary,
            hours=int(hours),
            actor_id=inter.user.id if inter.user else None,
            actor_name=str(inter.user),
            guild_name=inter.guild.name if inter.guild else None,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not result:
            await inter.followup.send("Unable to submit your concierge request right now.", ephemeral=True)
            return
        usage = result.get("usage")
        embed = factory.success(
            "Concierge engaged",
            "Your request was logged. Our concierge desk will respond within the SLA.",
        )
        request_id = result.get("requestId")
        embed.add_field(name="Contact", value=contact or "n/a", inline=True)
        embed.add_field(name="Hours requested", value=str(hours), inline=True)
        if request_id:
          embed.add_field(name="Request ID", value=f"`{request_id}`", inline=False)
        if usage:
            remaining = usage.get("remaining")
            if remaining is not None:
                embed.add_field(name="Remaining hours this cycle", value=str(remaining), inline=False)
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log(inter, action="request", metadata={"hours": int(hours)})

    @concierge.command(name="usage", description="Show remaining concierge hours this cycle.")
    async def usage(self, inter: discord.Interaction) -> None:
        if not await self._ensure_growth_plan(inter):
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Concierge integration is temporarily unavailable.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        usage = await service.fetch_usage(inter.guild.id if inter.guild else 0)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not usage:
            embed = factory.warning("No concierge usage found.", "Requests will appear here once logged.")
            await inter.followup.send(embed=embed, ephemeral=True)
            self._log(inter, action="usage_empty")
            return
        remaining = usage.get("remaining")
        total = usage.get("total")
        embed = factory.primary("Concierge usage")
        embed.add_field(name="Used hours", value=str(usage.get("used") or 0), inline=True)
        embed.add_field(name="Remaining", value=str(remaining if remaining is not None else "∞"), inline=True)
        if total is not None:
            embed.add_field(name="Monthly quota", value=str(total), inline=True)
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log(inter, action="usage_view", metadata={"remaining": remaining})

    @concierge.command(name="resolve", description="(Staff) mark a concierge request as fulfilled.")
    @app_commands.describe(
        request_id="Identifier returned by the concierge desk.",
        note="Optional resolution summary.",
    )
    async def resolve(self, inter: discord.Interaction, request_id: str, note: Optional[str] = None) -> None:
        if not self._is_staff(inter):
            await inter.response.send_message("Concierge staff privileges required.", ephemeral=True)
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Concierge integration is temporarily unavailable.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        result = await service.close_request(
            inter.guild.id if inter.guild else 0,
            request_id,
            actor_id=inter.user.id if inter.user else 0,
            actor_name=str(inter.user),
            note=note,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not result:
            await inter.followup.send("Unable to resolve that concierge request.", ephemeral=True)
            return
        embed = factory.success("Concierge updated", f"`{request_id}` marked as resolved.")
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log(inter, action="resolve", metadata={"requestId": request_id})


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ConciergeCommands(bot))
