"""Webhook emitter for queue lifecycle telemetry."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Tuple, Set, TypedDict

import aiohttp

from src.configs.schema import QueueTelemetryConfig
from src.services.server_settings_service import ServerSettingsService


class TelemetryEnvelope(TypedDict):
    ts: int
    event: str
    guild_id: Optional[int]
    shard_id: Optional[int]
    data: Optional[Dict[str, Any]]


class QueueTelemetryService:
    """Push queue lifecycle events (play, skip, finish) to an external consumer."""

    MODE_CACHE_TTL = 300

    def __init__(self, config: QueueTelemetryConfig, settings: ServerSettingsService) -> None:
        self.config = config
        self.enabled = config.enabled and bool(config.endpoint)
        self.logger = logging.getLogger("VectoBeat.QueueTelemetry")
        self._queue: asyncio.Queue[TelemetryEnvelope] = asyncio.Queue()
        self._task: Optional[asyncio.Task[None]] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._endpoint: Optional[str] = config.endpoint
        self._settings = settings
        self._mode_cache: Dict[int, Tuple[str, float]] = {}
        self._webhook_cache: Dict[int, Tuple[bool, Set[str], float]] = {}

    async def start(self) -> None:
        if not self.enabled or self._task:
            return
        timeout = aiohttp.ClientTimeout(total=10)
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
        envelope: TelemetryEnvelope = {
            "ts": int(time.time()),
            "event": event,
            "guild_id": guild_id if self.config.include_guild_metadata else None,
            "shard_id": shard_id if self.config.include_guild_metadata else None,
            "data": payload,
        }
        guild_id_int = int(guild_id) if guild_id else None
        mode = "advanced"
        if guild_id_int:
            allow, allowed_events = await self._webhook_preferences(guild_id_int)
            if not allow:
                return
            if allowed_events and event not in allowed_events:
                return
            mode = await self._analytics_mode(guild_id_int)
        envelope["data"] = self._apply_policy(payload, mode)
        if envelope["data"] is None:
            return
        await self._queue.put(envelope)

    async def _worker(self) -> None:
        try:
            while True:
                envelope = await self._queue.get()
                await self._send(envelope)
        except asyncio.CancelledError:
            pass

    async def _send(self, envelope: TelemetryEnvelope) -> None:
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

    async def _analytics_mode(self, guild_id: int) -> str:
        cached = self._mode_cache.get(guild_id)
        now = time.time()
        if cached and cached[1] > now:
            return cached[0]
        try:
            mode = await self._settings.analytics_mode(guild_id)
        except Exception:
            mode = "basic"
        self._mode_cache[guild_id] = (mode, now + self.MODE_CACHE_TTL)
        return mode

    def _apply_policy(self, payload: Dict[str, Any], mode: str) -> Optional[Dict[str, Any]]:
        if mode == "basic":
            return self._basic_payload(payload)
        if mode == "predictive":
            return self._predictive_payload(payload)
        return payload

    def _basic_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        summary: Dict[str, Any] = {}
        for key, value in payload.items():
            if isinstance(value, (str, int, float, bool)):
                summary[key] = value
            elif isinstance(value, dict):
                for nested_key, nested_value in value.items():
                    if isinstance(nested_value, (str, int, float, bool)):
                        summary[f"{key}_{nested_key}"] = nested_value
            elif isinstance(value, list):
                summary[f"{key}_count"] = len(value)
        if not summary:
            summary["note"] = "details redacted"
        return summary

    def _predictive_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(payload)
        hints: Dict[str, Any] = {}
        queue_length = payload.get("queue_length")
        if isinstance(queue_length, (int, float)):
            hints["remainingTracks"] = int(queue_length)
        queue_duration = payload.get("queue_duration_ms")
        if isinstance(queue_duration, (int, float)) and queue_duration > 0:
            hints["projectedIdleSeconds"] = max(0, int(queue_duration / 1000))
        track = payload.get("track")
        if isinstance(track, dict):
            duration = track.get("duration")
            if isinstance(duration, (int, float)):
                hints.setdefault("nowPlaying", {})["lengthSeconds"] = int(duration / 1000)
        if hints:
            enriched["predictive"] = hints
        return enriched

    async def _webhook_preferences(self, guild_id: int) -> Tuple[bool, Set[str]]:
        cached = self._webhook_cache.get(guild_id)
        now = time.time()
        if cached and cached[2] > now:
            return cached[0], cached[1]
        try:
            enabled, allowed = await self._settings.webhook_preferences(guild_id)
        except Exception:
            enabled, allowed = False, set()
        self._webhook_cache[guild_id] = (enabled, allowed, now + self.MODE_CACHE_TTL)
        return enabled, allowed
