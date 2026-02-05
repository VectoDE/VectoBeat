"""Simple TTL cache for expensive search queries."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, TypedDict

import lavalink

from src.configs.schema import CacheConfig

logger = logging.getLogger("VectoBeat.SearchCache")


class TrackInfo(TypedDict, total=False):
    identifier: str
    isSeekable: bool
    author: str
    length: int
    isStream: bool
    position: int
    title: str
    uri: str
    sourceName: str
    artworkUrl: str | None
    isrc: str | None


@dataclass
class CachedTrack:
    track: str
    info: TrackInfo


class SearchCacheService:
    """Store lavalink search responses for a short time."""

    def __init__(self, config: CacheConfig) -> None:
        self.enabled = config.search_enabled
        self.ttl = max(1, config.search_ttl_seconds)
        self.max_entries = max(10, config.search_max_entries)
        # Key -> (timestamp, load_type, tracks)
        self._store: dict[str, tuple[float, str, list[CachedTrack]]] = {}

    @staticmethod
    def _coerce_info(track: Any) -> TrackInfo | None:
        """Attempt to extract a dict payload from a Lavalink track-like object."""

        def to_dict(payload: Any) -> TrackInfo | None:
            if isinstance(payload, dict):
                return payload  # type: ignore[return-value]
            if hasattr(payload, "__dict__"):
                return payload.__dict__  # type: ignore[return-value]
            return None

        info = to_dict(getattr(track, "info", None))
        if info:
            return info

        raw = getattr(track, "raw", None)
        raw_dict = to_dict(raw)
        if raw_dict:
            info_data = raw_dict.get("info")
            if isinstance(info_data, dict):
                return info_data  # type: ignore[return-value]
            return raw_dict
        return None

    def _clean_expired(self) -> None:
        now = time.monotonic()
        expired = [key for key, (ts, _, _) in self._store.items() if now - ts > self.ttl]
        for key in expired:
            self._store.pop(key, None)

    def get(self, query: str) -> tuple[str, list[lavalink.AudioTrack]] | None:
        if not self.enabled:
            return None
        self._clean_expired()
        key = query.lower()
        entry = self._store.get(key)
        if not entry:
            return None
        _, load_type, tracks = entry
        reconstructed: list[lavalink.AudioTrack] = []
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
                # Reconstruct AudioTrack from cached data
                # Lavalink.py AudioTrack expects (track_id, info_dict, ...)
                reconstructed.append(lavalink.AudioTrack(item.track, info))
            except Exception as exc:
                logger.debug("Failed to rebuild cached track for query '%s': %s", key, exc)
        if not reconstructed:
            self._store.pop(key, None)
            return None
        return load_type, reconstructed

    def set(self, query: str, result: Any) -> None:
        if not self.enabled or not result or not getattr(result, "tracks", None):
            return
        key = query.lower()
        tracks: list[CachedTrack] = []
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
