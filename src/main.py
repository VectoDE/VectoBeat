"""Application bootstrap for the VectoBeat Discord bot.

This module wires together configuration, logging, Lavalink connectivity and
dynamic extension loading so the bot can be launched with a single call to
``python -m src.main``.  The module intentionally keeps side effects in the
``setup_hook`` lifecycle to make the import safe for testing.
"""

import logging
import os
from typing import Awaitable, Callable, List, Optional, Union

import discord
from discord.ext import commands

from src.configs.settings import CONFIG, DISCORD_TOKEN
from src.services.autoplay_service import AutoplayService
from src.services.dj_permission_service import DJPermissionManager
from src.services.chaos_service import ChaosService
from src.services.command_analytics_service import CommandAnalyticsService
from src.services.lavalink_service import LavalinkManager
from src.services.lyrics_service import LyricsService
from src.services.metrics_service import MetricsService
from src.services.playlist_service import PlaylistService
from src.services.profile_service import GuildProfileManager
from src.services.queue_telemetry_service import QueueTelemetryService
from src.services.search_cache import SearchCacheService
from src.services.scaling_service import ScalingService
from src.services.shard_supervisor import ShardSupervisor
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
        self.logger: Optional[logging.Logger] = None
        self._cleanup_tasks: List[Union[Callable[[], Awaitable[None]], Awaitable[None]]] = []
        self.lavalink_manager = LavalinkManager(self, CONFIG.lavalink_nodes)
        self.profile_manager = GuildProfileManager()
        self.playlist_service = PlaylistService(CONFIG.redis)
        self.autoplay_service = AutoplayService(CONFIG.redis)
        self.lyrics_service = LyricsService()
        self.dj_permissions = DJPermissionManager()
        self.shard_supervisor = ShardSupervisor(self)
        self.metrics_service = MetricsService(self, CONFIG.metrics)
        self.chaos_service = ChaosService(self, CONFIG.chaos)
        self.scaling_service = ScalingService(self, CONFIG.scaling)
        self.analytics_service = CommandAnalyticsService(CONFIG.analytics)
        self.queue_telemetry = QueueTelemetryService(CONFIG.queue_telemetry)
        self.search_cache = SearchCacheService(CONFIG.cache)

    def add_cleanup_task(self, task: Union[Callable[[], Awaitable[None]], Awaitable[None]]) -> None:
        """Register an async callable that should run before the bot shuts down."""
        self._cleanup_tasks.append(task)

    async def close(self):
        """Run registered cleanup tasks and gracefully stop Lavalink."""
        for task in self._cleanup_tasks:
            try:
                if callable(task):
                    await task()
                else:
                    await task
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

        if hasattr(self, "lyrics_service"):
            await self.lyrics_service.close()

        if hasattr(self, "shard_supervisor"):
            await self.shard_supervisor.close()

        if hasattr(self, "metrics_service"):
            await self.metrics_service.close()

        if hasattr(self, "chaos_service"):
            await self.chaos_service.close()

        if hasattr(self, "scaling_service"):
            await self.scaling_service.close()

        if hasattr(self, "analytics_service"):
            await self.analytics_service.close()

        if hasattr(self, "queue_telemetry"):
            await self.queue_telemetry.close()

        if hasattr(self, "search_cache"):
            self.search_cache = None

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
        self.lyrics_service.logger = logging.getLogger("VectoBeat.Lyrics")
        await self.shard_supervisor.start()
        await self.metrics_service.start()
        await self.chaos_service.start()
        await self.scaling_service.start()
        await self.analytics_service.start()
        await self.queue_telemetry.start()
        # search_cache is synchronous; no start required

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
