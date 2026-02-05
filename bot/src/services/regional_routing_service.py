"""Periodically reconcile Lavalink player placement with preferred regions."""

from __future__ import annotations

import asyncio
import logging

from discord.ext import commands
import lavalink

from src.services.lavalink_service import LavalinkManager, VectoPlayer
from src.services.server_settings_service import ServerSettingsService


class RegionalRoutingService:
    """Ensure guilds stay on their preferred Lavalink region with graceful failover."""

    def __init__(
        self,
        bot: commands.Bot,
        settings: ServerSettingsService,
        lavalink_manager: LavalinkManager,
        interval_seconds: int = 30,
    ) -> None:
        self.bot = bot
        self.settings = settings
        self.manager = lavalink_manager
        self.interval = max(10, int(interval_seconds))
        self.logger = logging.getLogger("VectoBeat.RegionalRouting")
        self.enabled = bool(self.settings and self.manager)
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Begin the reconciliation loop."""
        if not self.enabled or self._task:
            return
        self._task = asyncio.create_task(self._run())
        self.logger.info("Regional routing watchdog active (interval=%ss).", self.interval)

    async def close(self) -> None:
        """Stop the reconciliation loop."""
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def reconcile_all(self) -> None:
        """Re-evaluate routing for every active player."""
        if not self.enabled:
            return

        client: lavalink.Client | None = getattr(self.bot, "lavalink", None)
        if not client:
            return

        players = list(client.player_manager.players.values())
        if not players:
            return

        tasks = [
            self._reconcile_player(player)
            for player in players
            if isinstance(player, VectoPlayer) and player.guild_id
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def reconcile_guild(self, guild_id: int) -> None:
        """Immediately reconcile routing for a single guild."""
        if not self.enabled:
            return

        client: lavalink.Client | None = getattr(self.bot, "lavalink", None)
        if not client:
            return

        player = client.player_manager.get(guild_id)
        if not player or not isinstance(player, VectoPlayer):
            return

        await self._reconcile_player(player)

    async def _run(self) -> None:
        try:
            while True:
                try:
                    await self.reconcile_all()
                except Exception as exc:
                    self.logger.warning("Regional routing reconcile failed: %s", exc)
                await asyncio.sleep(self.interval)
        except asyncio.CancelledError:
            raise

    async def _reconcile_player(self, player: VectoPlayer) -> None:
        region = await self._desired_region(player.guild_id)
        await self.manager.route_player(player, region)

    async def _desired_region(self, guild_id: int) -> str:
        try:
            return await self.settings.lavalink_region(guild_id)
        except Exception:
            self.logger.debug(
                "Falling back to auto Lavalink region for guild %s after settings error.",
                guild_id,
            )
            return "auto"
