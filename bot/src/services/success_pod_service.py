"""HTTP client for coordinating success pod workflow with the control panel."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import aiohttp

from src.configs.schema import ControlPanelAPIConfig


class SuccessPodService:
    """Expose helper methods for fetching/updating success pod requests."""

    def __init__(self, config: ControlPanelAPIConfig) -> None:
        self.config = config
        self.enabled = bool(config.enabled and config.base_url)
        self.logger = logging.getLogger("VectoBeat.SuccessPod")
        self._session: Optional[aiohttp.ClientSession] = None
        self._endpoint = "/api/bot/success-pod"

    async def start(self) -> None:
        """Warm up the HTTP session if integration is enabled."""
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=max(3, self.config.timeout_seconds))
        self._session = aiohttp.ClientSession(timeout=timeout)
        self.logger.info("Success pod integration enabled.")

    async def close(self) -> None:
        """Dispose of the HTTP session."""
        if self._session:
            await self._session.close()
            self._session = None

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def fetch_requests(self, guild_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        """Return the most recent success pod requests for ``guild_id``."""
        if not self.enabled or not self._session:
            return []
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        params = {"guildId": str(guild_id), "limit": str(max(1, min(limit, 15)))}
        try:
            async with self._session.get(url, params=params, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning("Success pod fetch failed (%s): %s", resp.status, text)
                    return []
                payload = await resp.json()
                return list(payload.get("requests") or [])
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Success pod fetch transport error: %s", exc)
            return []

    async def create_request(
        self,
        guild_id: int,
        *,
        guild_name: Optional[str],
        contact: Optional[str],
        summary: str,
        actor_id: Optional[int],
        actor_name: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Submit a new success pod request for ``guild_id``."""
        payload = {
            "action": "create",
            "guildId": str(guild_id),
            "guildName": guild_name,
            "contact": contact,
            "summary": summary,
            "createdBy": str(actor_id) if actor_id else None,
            "source": "bot command",
        }
        if actor_name:
            payload["createdBy"] = payload.get("createdBy") or actor_name
        return await self._post(payload)

    async def acknowledge_request(
        self,
        guild_id: int,
        request_id: str,
        *,
        actor_id: int,
        actor_name: str,
        note: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_contact: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Mark ``request_id`` as acknowledged."""
        payload = {
            "action": "acknowledge",
            "guildId": str(guild_id),
            "requestId": request_id,
            "actor": actor_name,
            "actorId": str(actor_id),
            "note": note,
            "assignedTo": assigned_to,
            "assignedContact": assigned_contact,
        }
        return await self._post(payload)

    async def schedule_request(
        self,
        guild_id: int,
        request_id: str,
        *,
        actor_id: int,
        actor_name: str,
        scheduled_for: Optional[str],
        note: Optional[str],
        assigned_to: Optional[str] = None,
        assigned_contact: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Schedule a working session for ``request_id``."""
        payload = {
            "action": "schedule",
            "guildId": str(guild_id),
            "requestId": request_id,
            "actor": actor_name,
            "actorId": str(actor_id),
            "scheduledFor": scheduled_for,
            "note": note,
            "assignedTo": assigned_to,
            "assignedContact": assigned_contact,
        }
        return await self._post(payload)

    async def resolve_request(
        self,
        guild_id: int,
        request_id: str,
        *,
        actor_id: int,
        actor_name: str,
        note: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Resolve ``request_id`` with an optional note."""
        payload = {
            "action": "resolve",
            "guildId": str(guild_id),
            "requestId": request_id,
            "actor": actor_name,
            "actorId": str(actor_id),
            "resolutionNote": note,
            "note": note,
        }
        return await self._post(payload)

    async def _post(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.enabled or not self._session:
            return None
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        try:
            async with self._session.post(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning(
                        "Success pod request failed (status=%s): %s",
                        resp.status,
                        text,
                    )
                    return None
                data = await resp.json()
                return data.get("request")
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Success pod transport error: %s", exc)
            return None
