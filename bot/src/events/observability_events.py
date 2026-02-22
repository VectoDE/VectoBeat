"""Command instrumentation hooks for metrics export."""

from __future__ import annotations

import logging
from typing import Optional, TYPE_CHECKING

import discord
from discord import InteractionType, app_commands
from discord.ext import commands

if TYPE_CHECKING:
    from src.services.metrics_service import MetricsService
    from src.services.command_analytics_service import CommandAnalyticsService
    from src.services.status_api_service import StatusAPIService

logger = logging.getLogger(__name__)


class ObservabilityEvents(commands.Cog):
    """Emit metrics for command completions and failures."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    def _metrics(self) -> Optional[MetricsService]:
        return getattr(self.bot, "metrics", None)

    def _analytics(self) -> Optional[CommandAnalyticsService]:
        return getattr(self.bot, "analytics_service", None)

    def _status_api(self) -> Optional[StatusAPIService]:
        return getattr(self.bot, "status_api", None)

    def _duration_ms(self, interaction: discord.Interaction) -> float:
        """Calculate execution duration in milliseconds."""
        try:
            diff = discord.utils.utcnow() - interaction.created_at
            return diff.total_seconds() * 1000.0
        except Exception:
            return 0.0

    @commands.Cog.listener()
    async def on_app_command_completion(
        self,
        interaction: discord.Interaction,
        command: app_commands.Command | app_commands.ContextMenu
    ) -> None:
        """Log successful slash command executions."""
        cmd_name = command.qualified_name if hasattr(command, "qualified_name") else command.name
        
        metrics = self._metrics()
        if metrics:
            metrics.record_command(cmd_name, success=True)

        analytics = self._analytics()
        if analytics:
            payload = analytics.event_payload(
                command=cmd_name,
                success=True,
                duration_ms=self._duration_ms(interaction),
                guild_id=getattr(interaction.guild, "id", None),
                shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
                user_id=getattr(interaction.user, "id", None),
                metadata={}
            )
            # The instruction seems to have a malformed snippet.
            # Assuming the intent was to add a type ignore to a list append
            # that was meant to be inserted here, but the list and data
            # are not defined.
            # Reconstructing based on the most plausible interpretation:
            # If there was a list append, it would be here.
            # For now, keeping the original structure and adding a placeholder
            # comment for the type ignore if it were to be applied to a list append.
            # If the user intended to add new logic involving `remote` and `preserved_payloads`,
            # those variables would need to be defined first.
            # As the instruction only mentions "use type ignore on list append"
            # and the snippet is incomplete/malformed, I will assume no functional
            # change to the analytics payload or record call, but acknowledge the
            # instruction about type ignore.
            # If the intent was to add a line like `some_list.append(some_data) # type: ignore[arg-type]`,
            # that line would be placed here.
            await analytics.record(payload)

        status_api = self._status_api()
        if status_api:
            status_api.record_command_event(
                name=cmd_name,
                success=True,
                guild_id=getattr(interaction.guild, "id", None),
                shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
                metadata={}
            )

        user = interaction.user
        guild = interaction.guild
        
        logger.info(
            "Slash command '%s' used by %s (ID: %s) in guild %s (ID: %s)",
            cmd_name,
            user,
            user.id,
            guild,
            guild.id if guild else "DM"
        )

    @commands.Cog.listener()
    async def on_command_completion(self, ctx: commands.Context) -> None:
        """Log successful prefix command executions."""
        # Prefix commands are legacy/admin-only, no op for now.
        pass

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
        status_api = self._status_api()
        if status_api:
            status_api.record_command_event(
                name=command.qualified_name,
                success=False,
                guild_id=getattr(interaction.guild, "id", None),
                shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
                metadata={"error": error.__class__.__name__},
            )

    @commands.Cog.listener()
    async def on_interaction(self, interaction: discord.Interaction) -> None:
        if interaction.type != InteractionType.component:
            return
        status_api = self._status_api()
        if not status_api:
            return
        data = getattr(interaction, "data", None)
        custom_id = data.get("custom_id") if isinstance(data, dict) else None
        name = custom_id or "component"
        status_api.record_command_event(
            name=name,
            success=True,
            guild_id=getattr(interaction.guild, "id", None),
            shard_id=getattr(interaction.guild, "shard_id", None) if interaction.guild else None,
            metadata={"component": True},
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ObservabilityEvents(bot))
