"""Simple TTL cache for expensive search queries."""

from __future__ import annotations

import time
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import lavalink

from src.configs.schema import CacheConfig

logger = logging.getLogger(__name__)


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

    @staticmethod
    def _coerce_info(track: Any) -> Optional[Dict[str, Any]]:
        """Attempt to extract a dict payload from a Lavalink track-like object."""

        def to_dict(payload: Any) -> Optional[Dict[str, Any]]:
            if isinstance(payload, dict):
                return dict(payload)
            if hasattr(payload, "__dict__"):
                return dict(payload.__dict__)
            return None

        info = to_dict(getattr(track, "info", None))
        if info:
            return info

        raw = getattr(track, "raw", None)
        raw_dict = to_dict(raw)
        if raw_dict:
            return raw_dict.get("info") if isinstance(raw_dict.get("info"), dict) else raw_dict
        return None

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
        reconstructed: List[lavalink.AudioTrack] = []
        for item in tracks:
            info = item.info
            if not isinstance(info, dict):
                logger.debug(
                    "Dropping cached track for query '%s' due to invalid info type: %s",
                    key,
                    type(info).__name__,
                )
                continue
            try:
                reconstructed.append(lavalink.AudioTrack(item.track, info))
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Failed to rebuild cached track for query '%s': %s", key, exc)
        if not reconstructed:
            self._store.pop(key, None)
            return None
        return load_type, reconstructed

    def set(self, query: str, result: Any) -> None:
        if not self.enabled or not result or not getattr(result, "tracks", None):
            return
        key = query.lower()
        tracks: List[CachedTrack] = []
        for track in result.tracks:
            identifier = getattr(track, "track", None)
            info = self._coerce_info(track)
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
