"""Client used to record automation actions to the control panel."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import aiohttp

from src.configs.schema import ControlPanelAPIConfig
from src.services.server_settings_service import ServerSettingsService

GROWTH_ENABLED_TIERS = {"growth", "scale", "enterprise"}


class AutomationAuditService:
    """Forward automation actions to the control panel for auditing."""

    def __init__(self, config: ControlPanelAPIConfig, settings: ServerSettingsService) -> None:
        self.config = config
        self.settings = settings
        self.enabled = bool(config.enabled and config.base_url)
        self.logger = logging.getLogger("VectoBeat.AutomationAudit")
        self._session: Optional[aiohttp.ClientSession] = None
        self._endpoint = "/api/bot/automation-actions"

    async def start(self) -> None:
        """Initialise HTTP session."""
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=max(3, self.config.timeout_seconds))
        self._session = aiohttp.ClientSession(timeout=timeout)
        self.logger.info("Automation audit enabled (path=%s).", self._endpoint)

    async def close(self) -> None:
        """Dispose of resources."""
        if self._session:
            await self._session.close()
            self._session = None

    async def record_action(
        self,
        guild_id: int,
        *,
        action: str,
        category: str,
        description: str,
        metadata: Optional[dict[str, Any]] = None,
        shard_id: Optional[int] = None,
    ) -> None:
        """Push an automation action for auditing."""
        if not self.enabled or not self._session:
            return
        try:
            tier = await self.settings.tier(guild_id)
        except Exception:  # pragma: no cover - network guard
            tier = "free"
        if tier not in GROWTH_ENABLED_TIERS:
            return

        body: Dict[str, Any] = {
            "guildId": str(guild_id),
            "action": action,
            "category": category,
            "description": description,
            "metadata": metadata or {},
            "tier": tier,
        }
        if shard_id is not None:
            body["shardId"] = shard_id

        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        url = f"{self.config.base_url.rstrip('/')}{self._endpoint}"
        try:
            async with self._session.post(url, json=body, headers=headers) as resp:
                if resp.status >= 400:
                    text = (await resp.text())[:200]
                    self.logger.warning(
                        "Automation audit send failed for guild %s (%s): %s",
                        guild_id,
                        resp.status,
                        text,
                    )
        except aiohttp.ClientError as exc:  # pragma: no cover - network guard
            self.logger.error("Automation audit transport error for guild %s: %s", guild_id, exc)
