"""Background supervisor that restarts Discord shards when heartbeats stall."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Dict, Optional

import discord
from discord.gateway import DiscordWebSocket


class ShardSupervisor:
    """Monitor shard heartbeats and trigger reconnects when anomalies occur."""

    def __init__(
        self,
        bot: discord.Client,
        *,
        check_interval: float = 30.0,
        latency_threshold: float = 15.0,
        stale_after: float = 120.0,
    ):
        self.bot = bot
        self.check_interval = check_interval
        self.latency_threshold = latency_threshold
        self.stale_after = stale_after
        self.logger = logging.getLogger("VectoBeat.ShardSupervisor")
        self._task: Optional[asyncio.Task[None]] = None
        self._last_healthy: Dict[int, float] = {}
        self._base_latency_threshold = latency_threshold
        self._base_stale_after = stale_after
        self._guild_automation: Dict[int, str] = {}

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self.logger.info(
            "Starting shard supervisor (interval=%ss, latency_threshold=%sms, stale_after=%ss)",
            self.check_interval,
            int(self.latency_threshold * 1000),
            self.stale_after,
        )
        self._task = asyncio.create_task(self._run())

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def update_automation_for_guild(self, guild_id: int, mode: str) -> None:
        """Record the automation level for ``guild_id`` and adjust thresholds."""
        normalized = mode.lower()
        if normalized not in {"off", "smart", "full"}:
            return
        if normalized == "off":
            self._guild_automation.pop(guild_id, None)
        else:
            self._guild_automation[guild_id] = normalized
        self._reconfigure_thresholds()

    def _reconfigure_thresholds(self) -> None:
        modes = set(self._guild_automation.values())
        if "full" in modes:
            self.latency_threshold = max(5.0, self._base_latency_threshold * 0.66)
            self.stale_after = max(30.0, self._base_stale_after * 0.5)
        elif "smart" in modes:
            self.latency_threshold = max(7.5, self._base_latency_threshold * 0.8)
            self.stale_after = max(60.0, self._base_stale_after * 0.75)
        else:
            self.latency_threshold = self._base_latency_threshold
            self.stale_after = self._base_stale_after

    # ------------------------------------------------------------------ worker loop
    async def _run(self) -> None:
        try:
            if hasattr(self.bot, "wait_until_ready"):
                await self.bot.wait_until_ready()
            while True:
                await asyncio.sleep(self.check_interval)
                await self._scan_shards()
        except asyncio.CancelledError:
            pass

    async def _scan_shards(self) -> None:
        shards = getattr(self.bot, "shards", None)
        if not shards:
            return

        now = time.monotonic()
        for shard_id, shard in shards.items():
            latency = getattr(shard, "latency", None)
            parent = getattr(shard, "_parent", None)
            ws = getattr(parent, "ws", None) if parent else None
            is_closed = False
            if shard and hasattr(shard, "is_closed"):
                try:
                    is_closed = shard.is_closed()
                except Exception:  # pragma: no cover - defensive
                    is_closed = False

            if is_closed or ws is None:
                await self._restart_shard(shard_id, reason="websocket unavailable")
                self._last_healthy.pop(shard_id, None)
                continue

            if latency is None or latency <= 0:
                continue

            if latency < self.latency_threshold:
                self._last_healthy[shard_id] = now
                continue

            last_ok = self._last_healthy.get(shard_id)
            if last_ok is None:
                self._last_healthy[shard_id] = now
                continue

            if now - last_ok >= self.stale_after:
                await self._restart_shard(
                    shard_id,
                    reason=f"latency {latency*1000:.0f}ms (>{self.latency_threshold*1000:.0f}ms)",
                )
                self._last_healthy[shard_id] = now

    async def _restart_shard(self, shard_id: int, *, reason: str) -> None:
        shard = getattr(self.bot, "shards", {}).get(shard_id)
        parent = getattr(shard, "_parent", None) if shard else None
        ws = getattr(parent, "ws", None) if parent else None
        if not ws:
            await self._launch_shard(shard_id, reason)
            return

        self.logger.warning("Forcing shard %s reconnect due to %s.", shard_id, reason)
        close = getattr(ws, "close", None)
        if not close:
            self.logger.error("Shard %s websocket lacks close() coroutine.", shard_id)
            return
        try:
            result = close(code=1011)
            if inspect.isawaitable(result):
                await result
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.error("Error closing shard %s websocket: %s", shard_id, exc)

    async def _launch_shard(self, shard_id: int, reason: str) -> None:
        launcher = getattr(self.bot, "launch_shard", None)
        if not launcher:
            self.logger.warning(
                "Shard %s missing websocket and AutoShardedClient.launch_shard is unavailable (%s).",
                shard_id,
                reason,
            )
            return

        gateway = self._pick_gateway()
        self.logger.info("Shard %s missing websocket; relaunching (%s).", shard_id, reason)
        try:
            await launcher(gateway, shard_id)
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.error("Failed to relaunch shard %s: %s", shard_id, exc)

    def _pick_gateway(self):
        shards = getattr(self.bot, "shards", {})
        for shard in shards.values():
            parent = getattr(shard, "_parent", None)
            ws = getattr(parent, "ws", None) if parent else None
            gateway = getattr(ws, "gateway", None)
            if gateway:
                return gateway
        return DiscordWebSocket.DEFAULT_GATEWAY
