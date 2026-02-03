"""Command analytics pipeline for anonymised event streaming."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import aiohttp
import aiofiles

from src.configs.schema import AnalyticsConfig


class CommandAnalyticsService:
    """Buffer slash command events and forward them to storage/HTTP sinks."""

    def __init__(self, config: AnalyticsConfig) -> None:
        self.config = config
        self.enabled = config.enabled
        self.logger = logging.getLogger("VectoBeat.Analytics")
        self._queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._task: Optional[asyncio.Task[None]] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._flush_lock = asyncio.Lock()

    async def start(self) -> None:
        if not self.enabled or self._task:
            return
        interval = self.config.flush_interval_seconds
        self._task = asyncio.create_task(self._loop(interval))
        self.logger.info("Command analytics enabled (interval=%ss, batch=%s).", interval, self.config.batch_size)

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self._flush(force=True)
        if self._session:
            await self._session.close()
            self._session = None

    # ------------------------------------------------------------------ public API
    async def record(self, payload: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        await self._queue.put(payload)
        if self._queue.qsize() >= self.config.batch_size:
            await self._flush()

    # ------------------------------------------------------------------ internals
    async def _loop(self, interval: int) -> None:
        try:
            while True:
                await asyncio.sleep(interval)
                await self._flush()
        except asyncio.CancelledError:
            pass

    async def _flush(self, force: bool = False) -> None:
        if self._queue.empty() and not force:
            return
        async with self._flush_lock:
            batch: list[Dict[str, Any]] = []
            while not self._queue.empty() and len(batch) < self.config.batch_size:
                batch.append(self._queue.get_nowait())
            if not batch:
                return
            if self.config.endpoint:
                await self._send_http(batch)
            else:
                await self._write_file(batch)

    async def _send_http(self, batch: list[Dict[str, Any]]) -> None:
        if not self._session or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(timeout=timeout)
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        try:
            async with self._session.post(self.config.endpoint, json=batch, headers=headers) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.error("Analytics POST failed with %s: %s", resp.status, text[:200])
                else:
                    self.logger.debug("Pushed %s analytics events.", len(batch))
        except aiohttp.ClientError as exc:
            self.logger.error("Analytics transport error: %s", exc)

    async def _write_file(self, batch: list[Dict[str, Any]]) -> None:
        path = self.config.storage_path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            async with aiofiles.open(path, "a", encoding="utf-8") as handle:
                for event in batch:
                    await handle.write(json.dumps(event) + "\n")
        except OSError as exc:  # pragma: no cover - filesystem failure
            self.logger.error("Failed to append analytics events: %s", exc)

    # ------------------------------------------------------------------ helpers
    def anonymise_user(self, user_id: int) -> str:
        salt = self.config.hash_salt or "vectobeat"
        digest = hashlib.sha256(f"{salt}:{user_id}".encode("utf-8")).hexdigest()
        return digest[:32]

    def event_payload(
        self,
        *,
        command: str,
        success: bool,
        duration_ms: float,
        guild_id: Optional[int],
        shard_id: Optional[int],
        user_id: Optional[int],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "ts": int(time.time()),
            "command": command,
            "success": success,
            "duration_ms": round(duration_ms, 2),
            "guild_id": guild_id,
            "shard_id": shard_id,
        }
        if user_id is not None:
            payload["user_hash"] = self.anonymise_user(user_id)
        if metadata:
            payload["meta"] = metadata
        return payload
