"""Scheduled chaos engineering drills to validate resiliency."""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Deque, List, Optional, Tuple
from collections import deque

import discord
import lavalink

from src.configs.schema import ChaosConfig

ScenarioResult = Tuple[str, bool, str]


class ChaosService:
    """Run recurring chaos drills and allow manual triggering."""

    SUPPORTED_SCENARIOS = {"disconnect_voice", "disconnect_node", "inject_error"}

    def __init__(self, bot: discord.Client, config: ChaosConfig) -> None:
        self.bot = bot
        self.config = config
        self.enabled = config.enabled
        self.logger = logging.getLogger("VectoBeat.Chaos")
        self._task: Optional[asyncio.Task[None]] = None
        self.history: Deque[ScenarioResult] = deque(maxlen=20)

    async def start(self) -> None:
        if not self.config.enabled or self._task:
            return
        interval = int(self.config.interval_minutes * 60)
        self.logger.info("Chaos drills enabled (interval=%ss).", interval)
        self._task = asyncio.create_task(self._loop(interval))

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    # ------------------------------------------------------------------ scheduling
    async def _loop(self, interval: int) -> None:
        try:
            while True:
                await asyncio.sleep(interval)
                await self.run_random("scheduler")
        except asyncio.CancelledError:
            pass

    async def run_random(self, triggered_by: str) -> ScenarioResult:
        scenario = random.choice(self.config.scenarios or list(self.SUPPORTED_SCENARIOS))
        return await self.run_scenario(scenario, triggered_by=triggered_by)

    async def run_scenario(self, scenario: str, *, triggered_by: str) -> ScenarioResult:
        scenario = scenario.lower()
        if scenario not in self.SUPPORTED_SCENARIOS:
            result = (scenario, False, "Unsupported scenario")
            self.history.append(result)
            return result

        handlers = {
            "disconnect_voice": self._scenario_disconnect_voice,
            "disconnect_node": self._scenario_disconnect_node,
            "inject_error": self._scenario_inject_error,
        }
        handler = handlers.get(scenario)
        try:
            message = await handler(triggered_by=triggered_by)
            result = (scenario, True, message)
        except Exception as exc:  # pragma: no cover - chaos drills should never crash the bot
            self.logger.error("Chaos scenario '%s' failed: %s", scenario, exc)
            result = (scenario, False, str(exc))
        self.history.append(result)
        return result

    # ------------------------------------------------------------------ scenarios
    async def _scenario_disconnect_voice(self, *, triggered_by: str) -> str:
        if not self.bot.voice_clients:
            return "No active voice connections to disrupt."
        voice_client: discord.VoiceClient = random.choice(self.bot.voice_clients)
        channel = getattr(voice_client, "channel", None)
        await voice_client.disconnect(force=True)
        details = f"Disconnected from {channel} (guild {voice_client.guild.id})"
        self.logger.warning("[Chaos:%s] %s", triggered_by, details)
        return details

    async def _scenario_disconnect_node(self, *, triggered_by: str) -> str:
        lavalink_client: Optional[lavalink.Client] = getattr(self.bot, "lavalink", None)
        if not lavalink_client or not lavalink_client.node_manager.nodes:
            return "No Lavalink nodes registered."
        node = random.choice(lavalink_client.node_manager.nodes)
        await node.disconnect()
        details = f"Force-disconnected node {node.name}"
        self.logger.warning("[Chaos:%s] %s", triggered_by, details)
        return details

    async def _scenario_inject_error(self, *, triggered_by: str) -> str:
        message = f"Injected synthetic error by {triggered_by}"
        self.logger.warning("[Chaos] %s", message)
        self.bot.dispatch("chaos_error", triggered_by)
        return message

    # ------------------------------------------------------------------ helpers
    def recent_history(self) -> List[ScenarioResult]:
        return list(self.history)
