"""Auto scaling service that signals orchestrators based on live load."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import logging
import math
import time
from typing import Any, Dict, Optional

import aiohttp
import lavalink
from discord.ext import commands

from src.configs.schema import ScalingConfig


class ScalingService:
    """Periodically evaluate shard/node demand and call an external scaler."""

    def __init__(self, bot: commands.Bot, config: ScalingConfig):
        self.bot = bot
        self.config = config
        self.enabled = config.enabled and bool(config.endpoint)
        self.logger = logging.getLogger("VectoBeat.Scaling")
        self._task: Optional[asyncio.Task[None]] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._last_signal = 0.0
        self._last_payload: Optional[Dict[str, Any]] = None
        self._last_response: Optional[str] = None

    async def start(self) -> None:
        if not self.enabled or self._task:
            return
        interval = max(30, int(self.config.interval_seconds))
        self.logger.info(
            "Auto scaling enabled (provider=%s, endpoint=%s, interval=%ss)",
            self.config.provider,
            self.config.endpoint,
            interval,
        )
        self._task = asyncio.create_task(self._loop(interval))

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._session:
            await self._session.close()
            self._session = None

    # ------------------------------------------------------------------ orchestration
    async def _loop(self, interval: int) -> None:
        try:
            while True:
                await asyncio.sleep(interval)
                await self.evaluate(trigger="auto")
        except asyncio.CancelledError:
            pass

    async def evaluate(self, *, trigger: str) -> Optional[Dict[str, Any]]:
        payload = self._build_payload(trigger)
        if not payload:
            return None

        cooldown = max(60, int(self.config.cooldown_seconds))
        now = time.monotonic()
        if now - self._last_signal < cooldown and trigger == "auto":
            return payload

        await self._send(payload)
        return payload

    def _build_payload(self, trigger: str) -> Optional[Dict[str, Any]]:
        guilds = len(getattr(self.bot, "guilds", [])) or 0
        shards = max(len(getattr(self.bot, "shards", {})) or (self.bot.shard_count or 1), 1)
        lavalink_client: Any = getattr(self.bot, "lavalink", None)
        players = 0
        active_players = 0
        if lavalink_client:
            managed = list(lavalink_client.player_manager.players.values())
            players = len(managed)
            active_players = sum(1 for p in managed if getattr(p, "is_playing", False))
        current_nodes = 0
        if lavalink_client and getattr(lavalink_client, "node_manager", None):
            nodes = getattr(lavalink_client.node_manager, "nodes", [])
            current_nodes = len(nodes)

        desired_shards = self._clamp(
            math.ceil(max(1, guilds) / max(1, self.config.target_guilds_per_shard)),
            self.config.min_shards,
            self.config.max_shards,
        )
        desired_nodes = self._clamp(
            math.ceil(max(1, active_players or players) / max(1, self.config.target_players_per_node)),
            self.config.min_lavalink_nodes,
            self.config.max_lavalink_nodes,
        )

        delta_shards = desired_shards - shards
        delta_nodes = desired_nodes - current_nodes
        if delta_shards == 0 and (delta_nodes == 0 or current_nodes == 0):
            return None

        payload: Dict[str, Any] = {
            "trigger": trigger,
            "provider": self.config.provider,
            "metrics": {
                "guilds": guilds,
                "current_shards": shards,
                "players": players,
                "active_players": active_players,
                "current_lavalink_nodes": current_nodes,
            },
            "desired": {
                "shards": desired_shards,
                "lavalink_nodes": desired_nodes,
            },
        }
        return payload

    async def _send(self, payload: Dict[str, Any]) -> None:
        if not self.config.endpoint:
            return
        if not self._session or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=6)
            self._session = aiohttp.ClientSession(timeout=timeout)
        headers = {"Content-Type": "application/json"}
        if self.config.auth_token:
            headers["Authorization"] = f"Bearer {self.config.auth_token}"
        try:
            async with self._session.post(self.config.endpoint, json=payload, headers=headers) as resp:
                text = await resp.text()
                self._last_response = f"HTTP {resp.status}: {text[:200]}"
                self._last_payload = payload
                self._last_signal = time.monotonic()
                self.logger.info("Scaling signal dispatched: %s", self._last_response)
        except aiohttp.ClientError as exc:
            self._last_response = f"error: {exc}"
            self.logger.error("Scaling signal failed: %s", exc)

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _clamp(value: int, minimum: int, maximum: int) -> int:
        return max(minimum, min(maximum, value))

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "provider": self.config.provider,
            "endpoint": self.config.endpoint,
            "last_payload": self._last_payload,
            "last_response": self._last_response,
            "last_signal_s": time.monotonic() - self._last_signal if self._last_signal else None,
        }
