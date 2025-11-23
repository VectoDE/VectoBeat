"\"\"\"HTTP client for concierge escalation + scheduling.\"\"\""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import aiohttp

from src.configs.schema import ControlPanelAPIConfig


class ConciergeService:
    """Bridge concierge desk actions to the control panel API."""

    def __init__(self, config: ControlPanelAPIConfig):
        self.config = config
        self.enabled = bool(config.enabled and config.base_url)
        self.logger = logging.getLogger("VectoBeat.Concierge")
        self._endpoint = "/api/bot/concierge"
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self) -> None:
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=max(3, self.config.timeout_seconds))
        self._session = aiohttp.ClientSession(timeout=timeout)
        self.logger.info("Concierge integration enabled.")

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def fetch_usage(self, guild_id: int) -> Optional[Dict[str, Any]]:
        if not self.enabled or not self._session:
            return None
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        params = {"guildId": str(guild_id), "action": "usage"}
        try:
            async with self._session.get(url, params=params, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning("Concierge usage fetch failed (%s): %s", resp.status, text)
                    return None
                payload = await resp.json()
                return payload.get("usage")
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Concierge usage fetch error: %s", exc)
            return None

    async def create_request(
        self,
        guild_id: int,
        *,
        contact: str,
        summary: str,
        hours: int,
        actor_id: Optional[int],
        actor_name: Optional[str],
        guild_name: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "action": "create",
            "guildId": str(guild_id),
            "guildName": guild_name,
            "contact": contact,
            "summary": summary,
            "hours": hours,
            "actorId": str(actor_id) if actor_id else None,
            "actorName": actor_name,
            "source": "bot command",
        }
        return await self._post(payload)

    async def close_request(
        self,
        guild_id: int,
        request_id: str,
        *,
        actor_id: int,
        actor_name: str,
        note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        payload = {
            "action": "resolve",
            "guildId": str(guild_id),
            "requestId": request_id,
            "actorId": str(actor_id),
            "actorName": actor_name,
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
                    self.logger.warning("Concierge action failed (%s): %s", resp.status, text)
                    return None
                return await resp.json()
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Concierge transport error: %s", exc)
            return None
