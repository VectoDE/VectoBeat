"""Alert routing for moderator, on-call, and compliance signals."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import asyncio

import aiohttp

from src.configs.schema import AlertsConfig
from src.services.server_settings_service import ServerSettingsService
from src.services.queue_telemetry_service import QueueTelemetryService


class AlertService:
    """Send moderator/on-call/compliance events to configured endpoints."""

    MAX_QUEUE_DEPTH = 200

    def __init__(
        self,
        config: AlertsConfig,
        settings: ServerSettingsService,
        telemetry: Optional[QueueTelemetryService] = None,
    ):
        self.config = config
        self.settings = settings
        self.logger = logging.getLogger("VectoBeat.Alerts")
        self._session: Optional[aiohttp.ClientSession] = None
        self._queue: asyncio.Queue[tuple[str, Dict[str, Any]]] = asyncio.Queue()
        self._worker: Optional[asyncio.Task[None]] = None
        self._telemetry = telemetry

    async def start(self) -> None:
        if self._session:
            return
        timeout = aiohttp.ClientTimeout(total=5)
        self._session = aiohttp.ClientSession(timeout=timeout)
        self._worker = asyncio.create_task(self._worker_loop())

    async def close(self) -> None:
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None
        if self._session:
            await self._session.close()
            self._session = None

    async def moderator_alert(self, guild_id: int, message: str, **extras: Any) -> None:
        enabled = await self._flag(guild_id, "moderatorAlerts")
        if not enabled or not self.config.moderator_endpoint:
            return
        payload = self._base_payload(guild_id, {"message": message, **extras})
        await self._post(self.config.moderator_endpoint, payload)

    async def incident_alert(self, guild_id: int, message: str, *, priority: bool = False, **extras: Any) -> None:
        flag = "priorityCare" if priority else "incidentEscalation"
        enabled = await self._flag(guild_id, flag)
        endpoint = self.config.priority_endpoint if priority else self.config.incident_endpoint
        if not enabled or not endpoint:
            return
        payload = self._base_payload(guild_id, {"message": message, **extras, "priority": priority})
        await self._post(endpoint, payload)
        await self._mirror_to_telemetry(guild_id, "incident_created", payload)

    async def record_compliance(self, guild_id: int, event: str, details: Dict[str, Any]) -> None:
        enabled = await self._flag(guild_id, "compliancePack")
        if not enabled or not self.config.compliance_endpoint:
            return
        payload = self._base_payload(guild_id, {"event": event, "details": details})
        await self._post(self.config.compliance_endpoint, payload)

    async def _flag(self, guild_id: int, key: str) -> bool:
        try:
            state = await self.settings.get_settings(guild_id)
        except Exception:
            return False
        value = state.settings.get(key)
        return bool(value)

    def _base_payload(self, guild_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "guildId": str(guild_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        }

    async def _post(self, endpoint: str, payload: Dict[str, Any]) -> None:
        if not self._session:
            return
        if self._queue.qsize() >= self.MAX_QUEUE_DEPTH:
            self.logger.warning(
                "Dropping alert for guild %s due to backlog (size=%s).",
                payload.get("guildId"),
                self._queue.qsize(),
            )
            return
        await self._queue.put((endpoint, payload))

    async def _worker_loop(self) -> None:
        try:
            while True:
                endpoint, payload = await self._queue.get()
                await self._deliver(endpoint, payload)
        except asyncio.CancelledError:
            pass

    async def _deliver(self, endpoint: str, payload: Dict[str, Any]) -> None:
        if not self._session:
            return
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        try:
            async with self._session.post(endpoint, json=payload, headers=headers) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning("Alert POST failed (%s): %s", resp.status, text)
        except aiohttp.ClientError as exc:
            self.logger.error("Alert POST error: %s", exc)

    async def _mirror_to_telemetry(self, guild_id: int, event: str, payload: Dict[str, Any]) -> None:
        """Optionally mirror safety events into telemetry webhooks."""
        if not self._telemetry:
            return
        try:
            await self._telemetry.emit(
                event=event,
                guild_id=guild_id,
                shard_id=None,
                payload={"safety": payload},
            )
        except Exception as exc:
            self.logger.debug("Telemetry mirror failed for guild %s: %s", guild_id, exc)
