"""Webhook emitter for queue lifecycle telemetry."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional

import aiohttp

from src.configs.schema import QueueTelemetryConfig


class QueueTelemetryService:
    """Push queue lifecycle events (play, skip, finish) to an external consumer."""

    def __init__(self, config: QueueTelemetryConfig):
        self.config = config
        self.enabled = config.enabled and bool(config.endpoint)
        self.logger = logging.getLogger("VectoBeat.QueueTelemetry")
        self._queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._task: Optional[asyncio.Task[None]] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._endpoint: Optional[str] = config.endpoint

    async def start(self) -> None:
        if not self.enabled or self._task:
            return
        timeout = aiohttp.ClientTimeout(total=5)
        self._session = aiohttp.ClientSession(timeout=timeout)
        self._task = asyncio.create_task(self._worker())
        self.logger.info("Queue telemetry enabled. Endpoint=%s", self.config.endpoint)

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

    # ------------------------------------------------------------------ helpers
    async def emit(
        self,
        *,
        event: str,
        guild_id: Optional[int],
        shard_id: Optional[int],
        payload: Dict[str, Any],
    ) -> None:
        if not self.enabled:
            return
        envelope = {
            "ts": int(time.time()),
            "event": event,
            "guild_id": guild_id if self.config.include_guild_metadata else None,
            "shard_id": shard_id if self.config.include_guild_metadata else None,
            "data": payload,
        }
        await self._queue.put(envelope)

    async def _worker(self) -> None:
        try:
            while True:
                envelope = await self._queue.get()
                await self._send(envelope)
        except asyncio.CancelledError:
            pass

    async def _send(self, envelope: Dict[str, Any]) -> None:
        if not self._session or not self._endpoint:
            return
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        try:
            async with self._session.post(self._endpoint, json=envelope, headers=headers) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.error("Telemetry send failed (%s): %s", resp.status, text[:200])
        except aiohttp.ClientError as exc:
            self.logger.error("Telemetry transport error: %s", exc)
