"""Autoplay recommendation service leveraging Redis history."""

from __future__ import annotations

import json
import random
import time
from typing import Any, Dict, List, Optional

import lavalink
import redis.asyncio as redis
from redis import RedisError


class AutoplayError(RuntimeError):
    """Raised when autoplay recommendation or storage fails."""


class AutoplayService:
    """Persist listening history and surface recommendations per guild."""

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
    def _track_key(identifier: str) -> str:
        return f"autoplay:track:{identifier}"

    @staticmethod
    def _history_key(guild_id: int) -> str:
        return f"autoplay:history:{guild_id}"

    @staticmethod
    def _artist_key(guild_id: int, artist: str) -> str:
        return f"autoplay:artist:{guild_id}:{artist.lower()}"

    @staticmethod
    def _serialise_track(track: lavalink.AudioTrack) -> Dict[str, Any]:
        return {
            "track": getattr(track, "track", ""),
            "info": {
                "identifier": getattr(track, "identifier", ""),
                "author": getattr(track, "author", ""),
                "length": getattr(track, "duration", 0),
                "title": getattr(track, "title", "Unknown Title"),
                "uri": getattr(track, "uri", None),
                "sourceName": getattr(track, "source_name", None),
                "artworkUrl": getattr(track, "artwork_url", None),
            },
        }

    @staticmethod
    def _deserialise_track(payload: Dict[str, Any], requester: Optional[int] = None) -> Optional[lavalink.AudioTrack]:
        track_id = payload.get("track")
        info = payload.get("info")
        if not track_id or not info:
            return None
        audio = lavalink.AudioTrack(track_id, info, requester=requester)
        if requester:
            audio.requester = requester
        return audio

    # ------------------------------------------------------------------ public API
    async def record_play(self, guild_id: int, track: lavalink.AudioTrack) -> None:
        """Persist listening history for the current track."""
        identifier = getattr(track, "identifier", None)
        if not identifier:
            return

        data = self._serialise_track(track)
        history_key = self._history_key(guild_id)
        artist = (getattr(track, "author", "") or "unknown").lower()
        artist_key = self._artist_key(guild_id, artist)
        try:
            await self._redis.set(self._track_key(identifier), json.dumps(data))
            await self._redis.zadd(history_key, {identifier: time.time()})
            await self._redis.zadd(artist_key, {identifier: time.time()})
            await self._redis.zremrangebyrank(history_key, 0, -501)  # keep last 500
            await self._redis.zremrangebyrank(artist_key, 0, -201)  # keep last 200 per artist
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Failed recording autoplay history for %s: %s", identifier, exc)

    async def recommend(
        self,
        guild_id: int,
        *,
        limit: int = 10,
        exclude_identifier: Optional[str] = None,
        artist: Optional[str] = None,
        requester: Optional[int] = None,
        random_pick: bool = True,
    ) -> Optional[lavalink.AudioTrack]:
        """Return a recommended track using listening history."""
        identifiers: List[str] = []
        try:
            if artist:
                artist_key = self._artist_key(guild_id, artist.lower())
                artist_tracks = await self._redis.zrevrange(artist_key, 0, limit - 1)
                identifiers.extend(artist_tracks)
            if len(identifiers) < limit:
                history_key = self._history_key(guild_id)
                history_tracks = await self._redis.zrevrange(history_key, 0, limit - 1)
                identifiers.extend(history_tracks)
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Autoplay recommendation query failed: %s", exc)
            raise AutoplayError(str(exc)) from exc

        candidates = []
        seen = set()
        for identifier in identifiers:
            if not identifier or identifier == exclude_identifier or identifier in seen:
                continue
            seen.add(identifier)
            payload = await self._redis.get(self._track_key(identifier))
            if not payload:
                continue
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                continue
            track = self._deserialise_track(data, requester=requester)
            if track:
                candidates.append(track)
            if len(candidates) >= limit:
                break

        if not candidates:
            return None
        if random_pick and len(candidates) > 1:
            return random.choice(candidates)
        return candidates[0]

    async def ping(self) -> bool:
        """Check connectivity with Redis."""
        try:
            await self._redis.ping()
            if self.logger:
                self.logger.info(
                    "Autoplay storage reachable at %s:%s db=%s",
                    self.config.host,
                    self.config.port,
                    self.config.db,
                )
            return True
        except RedisError as exc:  # pragma: no cover - network call
            if self.logger:
                self.logger.error("Autoplay storage ping failed: %s", exc)
            raise AutoplayError(str(exc)) from exc

    async def close(self) -> None:
        """Close Redis connections."""
        try:
            await self._redis.close()
            await self._redis.connection_pool.disconnect()
        except RedisError:
            pass
