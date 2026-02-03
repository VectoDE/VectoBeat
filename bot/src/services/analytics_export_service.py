"""Periodic analytics export jobs for Growth+ guilds."""

from __future__ import annotations

import asyncio
import hmac
import hashlib
import json
import os
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TYPE_CHECKING

import aiofiles
from aiofiles import os as aios

from src.services.server_settings_service import ServerSettingsService

if TYPE_CHECKING:
    from src.services.profile_service import GuildProfileManager

GROWTH_TIERS = {"growth", "scale", "enterprise"}
logger = logging.getLogger("VectoBeat.AnalyticsExport")


class AnalyticsExportService:
    """Buffer queue/command events and flush JSON exports for Growth guilds."""

    def __init__(
        self, 
        settings: ServerSettingsService, 
        directory: str = "data/analytics_exports", 
        interval: int = 300,
        profile_manager: Optional[GuildProfileManager] = None
    ) -> None:
        self.settings = settings
        self.directory = directory
        self.interval = max(30, interval)
        self.profile_manager = profile_manager
        self._buffer: Dict[int, List[Dict[str, Any]]] = {}
        self._task: Optional[asyncio.Task[None]] = None
        os.makedirs(self.directory, exist_ok=True)

    async def start(self) -> None:
        if self._task:
            return
        self._task = asyncio.create_task(self._worker())

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self._flush_all()

    async def record_event(self, guild_id: int, event: str, payload: Dict[str, Any]) -> None:
        tier = await self.settings.tier(guild_id)
        
        # Allow export if tier is sufficient OR compliance mode is explicitly enabled
        compliance_enabled = False
        if self.profile_manager:
            profile = self.profile_manager.get(guild_id)
            compliance_enabled = getattr(profile, "compliance_mode", False)

        if tier not in GROWTH_TIERS and not compliance_enabled:
            return
        entry = {
            "event": event,
            "data": payload,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        
        # Enterprise Hardening: Sign the payload
        secret = getattr(self.settings.config, "api_key", "")

        if secret:
            serialized = json.dumps(entry, sort_keys=True)
            signature = hmac.new(secret.encode(), serialized.encode(), hashlib.sha256).hexdigest()
            entry["sig"] = signature
        else:
            logger.warning("No API key configured; analytics payload unsigned.")

        bucket = self._buffer.setdefault(guild_id, [])
        bucket.append(entry)

    async def _worker(self) -> None:
        try:
            while True:
                await asyncio.sleep(self.interval)
                await self._flush_all()
        except asyncio.CancelledError:
            pass

    async def _flush_all(self) -> None:
        if not self._buffer:
            return
        snapshot = self._buffer
        self._buffer = {}
        for guild_id, entries in snapshot.items():
            if not entries:
                continue
            path = os.path.join(self.directory, f"{guild_id}.jsonl")
            try:
                async with aiofiles.open(path, "a", encoding="utf-8") as handle:
                    for entry in entries:
                        await handle.write(json.dumps(entry, ensure_ascii=False))
                        await handle.write("\n")
            except OSError:
                # swallow errors; exporters are best-effort
                continue

    async def export_snapshot(self, guild_id: int, *, include_historic: bool = True) -> Optional[str]:
        """Return newline-delimited JSON entries for ``guild_id``."""
        tier = await self.settings.tier(guild_id)
        if tier not in GROWTH_TIERS:
            return None
        if not include_historic:
            pending = self._buffer.pop(guild_id, [])
            if not pending:
                return ""
            return "\n".join(json.dumps(entry, ensure_ascii=False) for entry in pending)
        await self._flush_all()
        path = os.path.join(self.directory, f"{guild_id}.jsonl")
        try:
            async with aiofiles.open(path, "r", encoding="utf-8") as handle:
                return await handle.read()
        except FileNotFoundError:
            return ""
        except OSError:
            return ""

    async def delete_data(self, guild_id: int) -> bool:
        """Permanently delete all compliance/analytics data for ``guild_id`` (GDPR)."""
        # Clear in-memory buffer
        self._buffer.pop(guild_id, None)
        
        # Delete on-disk file
        path = os.path.join(self.directory, f"{guild_id}.jsonl")
        try:
            if os.path.exists(path):
                await aios.remove(path)
                return True
            return False
        except OSError:
            return False
