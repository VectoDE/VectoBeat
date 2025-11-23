"\"\"\"Compliance export commands with scoped permissions.\"\"\""

from __future__ import annotations

import io
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory
from src.utils.security import SensitiveScope, has_scope, log_sensitive_action


def _service(bot: commands.Bot):
    svc = getattr(bot, "analytics_export", None)
    if not svc:
        raise RuntimeError("Analytics export service not configured.")
    return svc


class ComplianceCommands(commands.Cog):
    """Expose compliance-friendly exports for privileged staff."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    compliance = app_commands.Group(name="compliance", description="Compliance export controls", guild_only=True)

    def _is_admin(self, inter: discord.Interaction) -> bool:
        user = inter.user if isinstance(inter.user, discord.abc.User) else None
        if has_scope(user, SensitiveScope.COMPLIANCE_EXPORT):
            return True
        if not inter.guild or not user:
            return False
        member = inter.guild.get_member(user.id)
        return bool(member and member.guild_permissions.administrator)

    def _log(self, inter: discord.Interaction, action: str, metadata: dict | None = None) -> None:
        log_sensitive_action(
            self.bot,
            scope=SensitiveScope.COMPLIANCE_EXPORT,
            action=action,
            guild=inter.guild,
            user=inter.user if isinstance(inter.user, discord.abc.User) else None,
            metadata=metadata,
        )

    @compliance.command(name="export", description="Generate a compliance-ready JSONL export.")
    @app_commands.describe(include_historic="Include on-disk history in the export (default true).")
    async def export(self, inter: discord.Interaction, include_historic: bool = True):
        if not self._is_admin(inter):
            await inter.response.send_message("Compliance export privileges required.", ephemeral=True)
            return
        if not inter.guild:
            await inter.response.send_message("This command must be used in a guild.", ephemeral=True)
            return
        service = _service(self.bot)
        if not getattr(service, "settings", None):
            await inter.response.send_message("Compliance exports are not configured.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        payload = await service.export_snapshot(inter.guild.id, include_historic=include_historic)
        if payload is None:
            await inter.followup.send(
                "Compliance exports are limited to Growth plans and above.",
                ephemeral=True,
            )
            return
        if not payload:
            await inter.followup.send("No compliance events found for this guild.", ephemeral=True)
            self._log(inter, action="export_empty")
            return
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"compliance-{inter.guild.id}-{timestamp}.jsonl"
        buffer = io.BytesIO(payload.encode("utf-8"))
        file = discord.File(buffer, filename=filename)
        embed = EmbedFactory(inter.guild.id).success("Compliance export ready", "Attached JSONL contains the latest events.")
        await inter.followup.send(embed=embed, file=file, ephemeral=True)
        self._log(inter, action="export", metadata={"bytes": len(payload)})


async def setup(bot: commands.Bot):
    await bot.add_cog(ComplianceCommands(bot))
