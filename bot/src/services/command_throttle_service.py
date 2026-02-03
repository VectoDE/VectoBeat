"""Rate limiter that protects Growth+ guilds from overloading shards with commands."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Hashable, Tuple

from src.services.server_settings_service import ServerSettingsService

GROWTH_TIERS = {"growth", "scale", "enterprise"}


class CommandThrottleService:
    """Simple sliding-window limiter keyed by guild + bucket name."""

    def __init__(self, settings: ServerSettingsService, window_seconds: int = 15, growth_limit: int = 50) -> None:
        self.settings = settings
        self.window = window_seconds
        self.limit = growth_limit
        self._history: Dict[Tuple[int, Hashable], Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, guild_id: int, bucket: Hashable) -> Tuple[bool, float]:
        """Return whether ``bucket`` may proceed for ``guild_id`` and retry delay if not."""
        tier = await self.settings.tier(guild_id)
        if tier not in GROWTH_TIERS:
            return True, 0.0

        now = time.monotonic()
        key = (guild_id, bucket)
        async with self._lock:
            history = self._history[key]
            while history and now - history[0] > self.window:
                history.popleft()
            if len(history) >= self.limit:
                retry_after = max(1.0, self.window - (now - history[0]))
                return False, retry_after
            history.append(now)
        return True, 0.0
