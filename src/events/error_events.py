"""Global command error handling."""

import traceback

from discord.ext import commands

from src.utils.embeds import EmbedFactory
from src.utils.exceptions import UserFacingError


class ErrorEvents(commands.Cog):
    """Log unexpected errors and surface friendly messages to users."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_app_command_error(self, interaction, error):
        """Handle slash command exceptions with user friendly messaging."""
        factory = EmbedFactory(getattr(interaction.guild, "id", None))
        if isinstance(error, UserFacingError):
            try:
                if interaction.response.is_done():
                    await interaction.followup.send(embed=factory.error(error.message), ephemeral=True)
                else:
                    await interaction.response.send_message(embed=factory.error(error.message), ephemeral=True)
            except Exception:
                pass
            return

        self.bot.logger.error(
            "Unhandled app command error: %s",
            "".join(traceback.format_exception(type(error), error, error.__traceback__)),
        )
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=factory.error("Unexpected error. Please try again later."), ephemeral=True)
            else:
                await interaction.response.send_message(embed=factory.error("Unexpected error. Please try again later."), ephemeral=True)
        except Exception:
            pass


async def setup(bot: commands.Bot):
    """Entry point used by ``discord.ext.commands`` to register the cog."""
    await bot.add_cog(ErrorEvents(bot))
