"""Application bootstrap for the VectoBeat Discord bot.

This module wires together configuration, logging, Lavalink connectivity and
dynamic extension loading so the bot can be launched with a single call to
``python -m src.main``.  The module intentionally keeps side effects in the
``setup_hook`` lifecycle to make the import safe for testing.
"""

import os

import discord
from discord.ext import commands

from src.configs.settings import CONFIG, DISCORD_TOKEN
from src.services.lavalink_service import LavalinkManager
from src.services.autoplay_service import AutoplayService
from src.services.playlist_service import PlaylistService
from src.services.profile_service import GuildProfileManager
from src.utils.logger import setup_logging

INTENTS = discord.Intents.default()
INTENTS.guilds = True
INTENTS.voice_states = True
INTENTS.members = CONFIG.bot.intents.members
INTENTS.message_content = True  # Requires privileged intent


class VectoBeat(commands.AutoShardedBot):
    """Main bot implementation.

    ``AutoShardedBot`` is used so that the bot can scale automatically when the
    guild count grows.  The class adds a Lavalink manager, structured cleanup
    hooks and eager cog loading.
    """

    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=INTENTS,
            help_command=None,
            shard_count=CONFIG.bot.shard_count,
        )
        self.logger = None
        self._cleanup_tasks = []
        self.lavalink_manager = LavalinkManager(self, CONFIG.lavalink)
        self.profile_manager = GuildProfileManager()
        self.playlist_service = PlaylistService(CONFIG.redis)
        self.autoplay_service = AutoplayService(CONFIG.redis)

    def add_cleanup_task(self, task):
        """Register an async callable that should run before the bot shuts down."""
        self._cleanup_tasks.append(task)

    async def close(self):
        """Run registered cleanup tasks and gracefully stop Lavalink."""
        for task in self._cleanup_tasks:
            try:
                await task()
            except Exception as e:
                if self.logger:
                    self.logger.error("Error during cleanup: %s", e)

        if hasattr(self, "lavalink_manager"):
            await self.lavalink_manager.close()

        if hasattr(self, "profile_manager"):
            self.profile_manager.save()

        if hasattr(self, "playlist_service"):
            await self.playlist_service.close()

        if hasattr(self, "autoplay_service"):
            await self.autoplay_service.close()

        for vc in list(self.voice_clients):
            try:
                await vc.disconnect(force=True)
            except Exception as e:
                if self.logger:
                    self.logger.error("Error disconnecting voice client: %s", e)

        await super().close()

    async def setup_hook(self):
        """Configure logging, initialise Lavalink and load extensions."""
        setup_logging()
        import logging

        self.logger = logging.getLogger("VectoBeat")
        self.logger.info("Initializing VectoBeat...")

        await self.lavalink_manager.connect()
        self.playlist_service.logger = self.logger
        try:
            await self.playlist_service.ping()
        except Exception:
            if self.logger:
                self.logger.warning("Redis playlist backend is unreachable; playlist commands may fail.")
        self.autoplay_service.logger = self.logger
        try:
            await self.autoplay_service.ping()
        except Exception:
            if self.logger:
                self.logger.warning("Redis autoplay backend is unreachable; autoplay recommendations may fail.")

        # Load all cogs dynamically
        for pkg in ("events", "commands"):
            folder = os.path.join(os.path.dirname(__file__), pkg)
            for file in os.listdir(folder):
                if file.endswith(".py") and not file.startswith("__"):
                    ext = f"src.{pkg}.{file[:-3]}"
                    await self.load_extension(ext)
                    self.logger.info("Loaded extension: %s", ext)

        if CONFIG.bot.sync_commands_on_start:
            await self.tree.sync()
            self.logger.info("Slash commands synced.")


bot = VectoBeat()

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
