"""Client for retrieving/updating Scale account manager contacts."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import aiohttp

from src.configs.schema import ControlPanelAPIConfig


class ScaleContactService:
    """Expose account manager contact + escalation details."""

    def __init__(self, config: ControlPanelAPIConfig) -> None:
        self.config = config
        self.enabled = bool(config.enabled and config.base_url)
        self.logger = logging.getLogger("VectoBeat.ScaleContact")
        self._session: Optional[aiohttp.ClientSession] = None
        self._endpoint = "/api/bot/scale-contact"

    async def start(self) -> None:
        """Initialise HTTP session."""
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=max(3, self.config.timeout_seconds))
        self._session = aiohttp.ClientSession(timeout=timeout)

    async def close(self) -> None:
        """Dispose HTTP session."""
        if self._session:
            await self._session.close()
            self._session = None

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def fetch_contact(self, guild_id: int) -> Optional[Dict[str, Any]]:
        """Return contact info for ``guild_id``."""
        if not self.enabled or not self._session:
            return None
        params = {"guildId": str(guild_id)}
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        try:
            async with self._session.get(url, params=params, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning("Scale contact fetch failed (%s): %s", resp.status, text)
                    return None
                payload = await resp.json()
                return payload.get("contact")
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Scale contact transport error: %s", exc)
            return None

    async def update_contact(
        self,
        guild_id: int,
        *,
        manager_name: Optional[str],
        manager_email: Optional[str],
        manager_discord: Optional[str],
        escalation_channel: Optional[str],
        escalation_notes: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Persist contact info for ``guild_id``."""
        if not self.enabled or not self._session:
            return None
        payload = {
            "guildId": str(guild_id),
            "managerName": manager_name,
            "managerEmail": manager_email,
            "managerDiscord": manager_discord,
            "escalationChannel": escalation_channel,
            "escalationNotes": escalation_notes,
        }
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        try:
            async with self._session.post(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning("Scale contact update failed (%s): %s", resp.status, text)
                    return None
                data: Dict[str, Any] = await resp.json()
                return data.get("contact")
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Scale contact transport error: %s", exc)
            return None
