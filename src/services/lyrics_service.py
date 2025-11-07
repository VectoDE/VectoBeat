"""Lyric lookup helpers used to surface synced snippets in embeds."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional

import aiohttp

LRC_TAG_PATTERN = re.compile(r"\[(\d+):(\d+)(?:\.(\d+))?\]")


class LyricsService:
    """Fetch synced lyrics from public APIs and format snippets."""

    API_URL = "https://lrclib.net/api/search"

    def __init__(self, *, logger: Optional[logging.Logger] = None, cache_ttl: int = 3600):
        self.logger = logger or logging.getLogger("VectoBeat.Lyrics")
        self.cache_ttl = cache_ttl
        self._cache: Dict[str, tuple[float, Optional[Dict[str, Any]]]] = {}
        self._session: Optional[aiohttp.ClientSession] = None

    # ------------------------------------------------------------------ lifecycle
    async def close(self) -> None:
        """Close the underlying HTTP session when the bot shuts down."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None

    async def _client(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=6)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    # ------------------------------------------------------------------ cache helpers
    @staticmethod
    def _cache_key(title: str, artist: Optional[str]) -> str:
        safe_artist = (artist or "unknown").strip().lower()
        safe_title = (title or "unknown").strip().lower()
        return f"{safe_artist}::{safe_title}"

    def _cache_get(self, key: str) -> Optional[Dict[str, Any]]:
        cached = self._cache.get(key)
        if not cached:
            return None
        timestamp, payload = cached
        if time.monotonic() - timestamp > self.cache_ttl:
            self._cache.pop(key, None)
            return None
        return payload

    def _cache_set(self, key: str, payload: Optional[Dict[str, Any]]) -> None:
        self._cache[key] = (time.monotonic(), payload)

    # ------------------------------------------------------------------ lookup + parsing
    async def fetch(
        self,
        *,
        title: str,
        artist: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch synced lyrics for the supplied title/artist pair."""
        if not title:
            return None

        cache_key = self._cache_key(title, artist)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        query = " ".join(filter(None, (artist, title))).strip()
        if not query:
            return None

        session = await self._client()
        try:
            async with session.get(self.API_URL, params={"q": query}) as resp:
                if resp.status != 200:
                    self.logger.debug("Lyrics lookup failed with HTTP %s for query '%s'", resp.status, query)
                    self._cache_set(cache_key, None)
                    return None
                payload = await resp.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            self.logger.debug("Lyrics lookup error for '%s': %s", query, exc)
            self._cache_set(cache_key, None)
            return None

        if not isinstance(payload, list) or not payload:
            self._cache_set(cache_key, None)
            return None

        candidate = self._select_candidate(payload, duration_ms)
        if not candidate:
            self._cache_set(cache_key, None)
            return None

        lines = self._parse_synced(candidate.get("syncedLyrics") or "")
        if not lines:
            self._cache_set(cache_key, None)
            return None

        result = {
            "source": "LRCLIB",
            "provider_url": f"https://lrclib.net/songs/{candidate.get('id')}" if candidate.get("id") else None,
            "track": candidate.get("trackName") or title,
            "artist": candidate.get("artistName") or artist or "unknown",
            "lines": lines,
        }
        self._cache_set(cache_key, result)
        return result

    def _select_candidate(self, results: List[Dict[str, Any]], duration_ms: Optional[int]) -> Optional[Dict[str, Any]]:
        best: Optional[Dict[str, Any]] = None
        best_score = float("inf")
        for item in results:
            synced = item.get("syncedLyrics")
            if not synced:
                continue
            duration = item.get("duration")
            track_duration = None
            if isinstance(duration, (int, float)):
                track_duration = int(float(duration) * 1000)
            elif isinstance(duration, str):
                try:
                    track_duration = int(float(duration) * 1000)
                except ValueError:
                    track_duration = None

            score = 0.0
            if duration_ms and track_duration:
                score += abs(track_duration - duration_ms)
            if score < best_score:
                best = item
                best_score = score
        return best

    @staticmethod
    def _parse_synced(content: str) -> List[Dict[str, Any]]:
        if not content:
            return []
        parsed: List[Dict[str, Any]] = []
        for raw_line in content.splitlines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            lyric_text = LRC_TAG_PATTERN.sub("", raw_line).strip()
            lyric_text = lyric_text or "♪"
            for match in LRC_TAG_PATTERN.finditer(raw_line):
                minutes = int(match.group(1))
                seconds = int(match.group(2))
                fraction = match.group(3) or "0"
                ms = (minutes * 60 + seconds) * 1000 + int(fraction.ljust(3, "0")[:3])
                parsed.append({"timestamp": ms, "text": lyric_text})
        parsed.sort(key=lambda item: item["timestamp"])

        # Deduplicate timestamps and drop empty payloads
        cleaned: List[Dict[str, Any]] = []
        seen_ts = set()
        for item in parsed:
            ts = item["timestamp"]
            if ts in seen_ts:
                continue
            seen_ts.add(ts)
            if item["text"].strip():
                cleaned.append(item)
        return cleaned

    # ------------------------------------------------------------------ formatting
    def snippet(self, payload: Dict[str, Any], position_ms: int, window: int = 1) -> Optional[str]:
        """Render a small lyrics window around ``position_ms``."""
        lines = payload.get("lines") or []
        if not lines:
            return None

        index = self._line_index(lines, position_ms)
        start = max(0, index - window)
        end = min(len(lines), index + window + 1)
        block: List[str] = []
        for offset in range(start, end):
            text = lines[offset]["text"].strip()
            if not text:
                continue
            prefix = "▶" if offset == index else "•"
            block.append(f"{prefix} {text}")

        if not block:
            return None

        snippet_text = "\n".join(block)
        provider_url = payload.get("provider_url")
        if provider_url:
            snippet_text = f"{snippet_text}\n[Full lyrics]({provider_url})"
        return snippet_text[:1024]

    @staticmethod
    def _line_index(lines: List[Dict[str, Any]], position_ms: int) -> int:
        if not lines:
            return 0
        index = 0
        for idx, line in enumerate(lines):
            if position_ms + 500 >= line["timestamp"]:
                index = idx
            else:
                break
        return index
