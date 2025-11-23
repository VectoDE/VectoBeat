"""HTTP publisher for queue synchronization events."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp
import lavalink

from src.configs.schema import QueueSyncConfig
from src.services.server_settings_service import ServerSettingsService

SNAPSHOT_TIERS = {"starter", "pro", "growth", "scale", "enterprise"}
REALTIME_TIERS = {"pro", "growth", "scale", "enterprise"}


class QueueSyncService:
    """Send queue state snapshots to the control panel for real-time sync."""

    def __init__(self, config: QueueSyncConfig, settings: ServerSettingsService):
        self.config = config
        self.settings = settings
        self.enabled = bool(config.enabled and config.endpoint)
        self.logger = logging.getLogger("VectoBeat.QueueSync")
        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=5)
        self._session = aiohttp.ClientSession(timeout=timeout)
        self.logger.info("Queue sync enabled (endpoint=%s).", self.config.endpoint)

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    async def publish_state(
        self,
        guild_id: int,
        player: Optional[lavalink.DefaultPlayer],
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Send the current queue snapshot for ``guild_id``."""
        if not self.enabled or not self._session or not player:
            return

        tier = await self.settings.tier(guild_id)
        if tier not in SNAPSHOT_TIERS:
            return

        realtime = tier in REALTIME_TIERS
        snapshot = self._snapshot(player)
        payload_metadata: Dict[str, Any] = dict(metadata or {})
        payload_metadata.setdefault("tier", tier)
        payload_metadata.setdefault("syncMode", "realtime" if realtime else "snapshot")
        payload = {
            "guildId": str(guild_id),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
            "metadata": payload_metadata,
            **snapshot,
        }

        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        try:
            async with self._lock:
                async with self._session.post(self.config.endpoint, json=payload, headers=headers) as resp:
                    if resp.status >= 400:
                        text = (await resp.text())[:200]
                        self.logger.warning(
                            "Queue sync POST failed for guild %s (%s): %s",
                            guild_id,
                            resp.status,
                            text,
                        )
        except aiohttp.ClientError as exc:
            self.logger.error("Queue sync transport error for guild %s: %s", guild_id, exc)

    @staticmethod
    def _snapshot(player: lavalink.DefaultPlayer) -> Dict[str, Any]:
        def serialize(track: Optional[lavalink.AudioTrack]) -> Optional[Dict[str, Any]]:
            if not track:
                return None
            return {
                "title": getattr(track, "title", "Unknown Title"),
                "author": getattr(track, "author", "Unknown Artist"),
                "duration": getattr(track, "duration", 0),
                "uri": getattr(track, "uri", None),
                "artworkUrl": getattr(track, "artwork_url", None),
                "source": getattr(track, "source_name", None),
                "requester": str(getattr(track, "requester", "")) if getattr(track, "requester", None) else None,
            }

        queue: List[Dict[str, Any]] = []
        for track in list(getattr(player, "queue", []))[:50]:
            serialized = serialize(track)
            if serialized:
                queue.append(serialized)

        return {
            "nowPlaying": serialize(getattr(player, "current", None)),
            "queue": queue,
            "paused": bool(getattr(player, "paused", False)),
            "volume": getattr(player, "volume", None),
        }
