"""Simple TTL cache for expensive search queries."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import lavalink

from src.configs.schema import CacheConfig


@dataclass
class CachedTrack:
    track: str
    info: Dict[str, Any]


class SearchCacheService:
    """Store lavalink search responses for a short time."""

    def __init__(self, config: CacheConfig):
        self.enabled = config.search_enabled
        self.ttl = max(1, config.search_ttl_seconds)
        self.max_entries = max(10, config.search_max_entries)
        self._store: Dict[str, Tuple[float, str, List[CachedTrack]]] = {}

    def _clean_expired(self) -> None:
        now = time.monotonic()
        expired = [key for key, (ts, _, _) in self._store.items() if now - ts > self.ttl]
        for key in expired:
            self._store.pop(key, None)

    def get(self, query: str) -> Optional[Tuple[str, List[lavalink.AudioTrack]]]:
        if not self.enabled:
            return None
        self._clean_expired()
        key = query.lower()
        entry = self._store.get(key)
        if not entry:
            return None
        _, load_type, tracks = entry
        reconstructed = [lavalink.AudioTrack(item.track, item.info) for item in tracks]
        return load_type, reconstructed

    def set(self, query: str, result: Any) -> None:
        if not self.enabled or not result or not getattr(result, "tracks", None):
            return
        key = query.lower()
        tracks: List[CachedTrack] = []
        for track in result.tracks:
            identifier = getattr(track, "track", None)
            info = getattr(track, "info", None) or getattr(track, "raw", None)
            if not identifier or not info:
                continue
            tracks.append(CachedTrack(track=identifier, info=info))
        if not tracks:
            return
        if len(self._store) >= self.max_entries:
            oldest_key = min(self._store, key=lambda k: self._store[k][0])
            self._store.pop(oldest_key, None)
        self._store[key] = (time.monotonic(), getattr(result, "load_type", "SEARCH_RESULT"), tracks)

    def clear(self) -> None:
        """Drop all cached search results."""
        self._store.clear()
