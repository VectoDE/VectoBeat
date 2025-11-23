"""Redis-backed playlist persistence."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional, Tuple

import lavalink
import redis.asyncio as redis
from redis import RedisError


class PlaylistStorageError(RuntimeError):
    """Raised when playlist persistence fails."""


class PlaylistService:
    """Provide CRUD operations for guild playlists using Redis storage."""

    def __init__(self, config, *, logger=None):
        self.config = config
        self.logger = logger
        self._redis = redis.Redis(
            host=config.host,
            port=config.port,
            password=config.password or None,
            db=config.db,
            decode_responses=True,
        )

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _key(guild_id: int, name: str) -> str:
        return f"playlist:{guild_id}:{name.lower()}"

    @staticmethod
    def _serialise(tracks: Iterable[lavalink.AudioTrack]) -> List[Dict[str, Any]]:
        payload: List[Dict[str, Any]] = []
        for track in tracks:
            info = {
                "identifier": getattr(track, "identifier", ""),
                "author": getattr(track, "author", ""),
                "length": getattr(track, "duration", 0),
                "title": getattr(track, "title", "Unknown Title"),
                "uri": getattr(track, "uri", None),
                "sourceName": getattr(track, "source_name", None),
                "artworkUrl": getattr(track, "artwork_url", None),
            }
            payload.append(
                {
                    "track": getattr(track, "track", ""),
                    "info": info,
                    "requester": getattr(track, "requester", None),
                }
            )
        return payload

    @staticmethod
    def _deserialise(
        entries: List[Dict[str, Any]], *, default_requester: Optional[int] = None
    ) -> List[lavalink.AudioTrack]:
        tracks: List[lavalink.AudioTrack] = []
        for entry in entries:
            track_id = entry.get("track")
            info = entry.get("info") or {}
            if not track_id or not info:
                continue
            requester = entry.get("requester", default_requester)
            audio = lavalink.AudioTrack(track_id, info, requester=requester)
            audio.requester = requester
            tracks.append(audio)
        return tracks

    # ------------------------------------------------------------------ CRUD operations
    async def save_playlist(
        self,
        guild_id: int,
        name: str,
        tracks: Iterable[lavalink.AudioTrack],
        *,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Persist the provided tracks under ``name`` and return the count saved."""
        serialised = self._serialise(tracks)
        key = self._key(guild_id, name)
        payload: Dict[str, Any] = {"tracks": serialised}
        if metadata:
            payload["meta"] = metadata
        try:
            await self._redis.set(key, json.dumps(payload))
            return len(serialised)
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Failed saving playlist '%s' for %s: %s", name, guild_id, exc)
            raise PlaylistStorageError(str(exc)) from exc

    async def load_playlist(
        self,
        guild_id: int,
        name: str,
        *,
        default_requester: Optional[int] = None,
    ) -> Tuple[List[lavalink.AudioTrack], Optional[Dict[str, Any]]]:
        """Fetch and deserialise a playlist by name, returning tracks and metadata."""
        key = self._key(guild_id, name)
        try:
            data = await self._redis.get(key)
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Failed loading playlist '%s' for %s: %s", name, guild_id, exc)
            raise PlaylistStorageError(str(exc)) from exc
        if not data:
            return [], None
        try:
            items = json.loads(data)
        except json.JSONDecodeError:
            if self.logger:
                self.logger.error("Invalid playlist payload for key %s", key)
            return [], None

        metadata: Optional[Dict[str, Any]] = None
        track_entries: List[Dict[str, Any]] = []
        if isinstance(items, dict):
            meta = items.get("meta")
            metadata = meta if isinstance(meta, dict) else None
            track_entries = items.get("tracks", []) if isinstance(items.get("tracks"), list) else []
        elif isinstance(items, list):
            track_entries = items
        else:
            track_entries = []

        tracks = self._deserialise(track_entries, default_requester=default_requester)
        return tracks, metadata

    async def list_playlists(self, guild_id: int) -> List[str]:
        """Return a sorted list of playlist names stored for the guild."""
        pattern = self._key(guild_id, "*")
        names = set()
        try:
            async for key in self._redis.scan_iter(pattern):
                _, _, remainder = key.partition(":")
                _, _, name = remainder.partition(":")
                if name:
                    names.add(name)
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Failed listing playlists for %s: %s", guild_id, exc)
            raise PlaylistStorageError(str(exc)) from exc
        return sorted(names)

    async def delete_playlist(self, guild_id: int, name: str) -> bool:
        """Delete the named playlist; returns True if a key was removed."""
        key = self._key(guild_id, name)
        try:
            removed = await self._redis.delete(key)
            return bool(removed)
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Failed deleting playlist '%s' for %s: %s", name, guild_id, exc)
            raise PlaylistStorageError(str(exc)) from exc

    async def ping(self) -> bool:
        """Check connectivity with the backing Redis instance."""
        try:
            await self._redis.ping()
            if self.logger:
                self.logger.info(
                    "Playlist storage reachable at %s:%s db=%s",
                    self.config.host,
                    self.config.port,
                    self.config.db,
                )
            return True
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Playlist storage ping failed: %s", exc)
            raise PlaylistStorageError(str(exc)) from exc

    async def close(self) -> None:
        """Close the Redis connection."""
        try:
            await self._redis.close()
            await self._redis.connection_pool.disconnect()
        except RedisError:
            pass
