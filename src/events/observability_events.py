"""Command instrumentation hooks for metrics export."""

from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands


class ObservabilityEvents(commands.Cog):
    """Emit metrics for command completions and failures."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    def _metrics(self):
        return getattr(self.bot, "metrics_service", None)

    def _analytics(self):
        return getattr(self.bot, "analytics_service", None)

    @staticmethod
    def _duration_ms(interaction: discord.Interaction) -> float:
        if not getattr(interaction, "created_at", None):
            return 0.0
        delta = discord.utils.utcnow() - interaction.created_at
        return delta.total_seconds() * 1000

    @commands.Cog.listener()
    async def on_app_command_completion(self, interaction: discord.Interaction, command: app_commands.Command) -> None:
        metrics = self._metrics()
        if metrics:
            metrics.record_command(command.qualified_name, success=True)
        analytics = self._analytics()
        if analytics:
            payload = analytics.event_payload(
                command=command.qualified_name,
                success=True,
                duration_ms=self._duration_ms(interaction),
                guild_id=getattr(interaction.guild, "id", None),
                shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
                user_id=getattr(interaction.user, "id", None),
            )
            await analytics.record(payload)

    @commands.Cog.listener()
    async def on_app_command_error(
        self,
        interaction: discord.Interaction,
        command: app_commands.Command,
        error: app_commands.AppCommandError,
    ) -> None:
        metrics = self._metrics()
        if metrics:
            metrics.record_command(command.qualified_name, success=False)
        analytics = self._analytics()
        if analytics:
            payload = analytics.event_payload(
                command=command.qualified_name,
                success=False,
                duration_ms=self._duration_ms(interaction),
                guild_id=getattr(interaction.guild, "id", None),
                shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
                user_id=getattr(interaction.user, "id", None),
                metadata={"error": error.__class__.__name__},
            )
            await analytics.record(payload)


async def setup(bot: commands.Bot):
    await bot.add_cog(ObservabilityEvents(bot))
