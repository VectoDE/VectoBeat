"""Global command error handling."""

import traceback

import discord
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory
from src.utils.exceptions import UserFacingError


class ErrorEvents(commands.Cog):
    """Log unexpected errors and surface friendly messages to users."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_tree_error(
        self,
        interaction: discord.Interaction,
        error: app_commands.AppCommandError
    ) -> None:
        """Global error handler for app commands (slash commands)."""
        factory = EmbedFactory(getattr(interaction.guild, "id", None))
        if isinstance(error, UserFacingError):
            try:
                if interaction.response.is_done():
                    await interaction.followup.send(embed=factory.error(error.message), ephemeral=True)
                else:
                    await interaction.response.send_message(embed=factory.error(error.message), ephemeral=True)
            except Exception as e:
                bot_logger = getattr(self.bot, "logger", None)
                if bot_logger:
                    bot_logger.debug("Suppressed error sending UserFacingError: %s", e)
            return

        fallback_embed = factory.error("Unexpected error. Please try again later.")
        bot_logger = getattr(self.bot, "logger", None)
        if bot_logger:
            bot_logger.error(
                "Unhandled app command error: %s",
                "".join(traceback.format_exception(type(error), error, error.__traceback__)),
            )
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=fallback_embed, ephemeral=True)
            else:
                await interaction.response.send_message(embed=fallback_embed, ephemeral=True)
        except Exception as e:
            bot_logger = getattr(self.bot, "logger", None)
            if bot_logger:
                bot_logger.debug("Suppressed error sending fallback embed: %s", e)


async def setup(bot: commands.Bot) -> None:
    """Entry point used by ``discord.ext.commands`` to register the cog."""
    await bot.add_cog(ErrorEvents(bot))
