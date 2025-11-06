"""Utility wrappers around yt-dlp for resolving audio sources."""

import asyncio
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional

import discord
import yt_dlp

YTDL_OPTIONS = {
    "format": "bestaudio/best",
    "quiet": True,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
    "extract_flat": False,
    "skip_download": True,
    "geo_bypass": True,
    "nocheckcertificate": True,
    "noplaylist": False,
}

YTDL = yt_dlp.YoutubeDL(YTDL_OPTIONS)


URL_REGEX = re.compile(r"https?://", re.IGNORECASE)


@dataclass
class TrackInfo:
    """Lightweight data container describing an audio track."""

    title: str
    author: str
    duration_ms: int
    webpage_url: str
    thumbnail: Optional[str]
    source: str
    requester: Optional[str] = None

    @property
    def duration_formatted(self) -> str:
        """Return the duration as a formatted string."""
        seconds = max(0, int(self.duration_ms // 1000))
        minutes, secs = divmod(seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours:d}:{minutes:02d}:{secs:02d}"
        return f"{minutes:d}:{secs:02d}"


class AudioService:
    def __init__(self):
        self._ytdl = YTDL

    async def resolve(self, query: str, limit: int = 5, requester: Optional[str] = None) -> List[TrackInfo]:
        """Resolve a URL or search query into a list of TrackInfo entries."""
        effective_query = query.strip()

        if self._is_spotify_link(effective_query):
            # Extract metadata and search on YouTube for playable audio.
            metadata = await asyncio.to_thread(self._ytdl.extract_info, effective_query, download=False)
            entries = metadata.get("entries") or [metadata]
            tracks: List[TrackInfo] = []
            for entry in entries:
                title = entry.get("title")
                artist = entry.get("artist") or entry.get("uploader") or ""
                if not title:
                    continue
                search_query = f"{artist} - {title}" if artist else title
                tracks.extend(await self.resolve(search_query, limit=1, requester=requester))
            return tracks

        if not URL_REGEX.match(effective_query):
            effective_query = f"ytsearch{limit}:{effective_query}"

        data = await asyncio.to_thread(self._ytdl.extract_info, effective_query, download=False)
        if data is None:
            return []

        entries: Iterable[dict] = data.get("entries") or [data]
        tracks: List[TrackInfo] = []
        for entry in entries:
            if entry is None:
                continue
            duration = int((entry.get("duration") or 0) * 1000)
            track = TrackInfo(
                title=entry.get("title") or "Unknown Title",
                author=entry.get("uploader") or entry.get("artist") or "Unknown Artist",
                duration_ms=duration,
                webpage_url=entry.get("webpage_url") or entry.get("url") or query,
                thumbnail=self._pick_thumbnail(entry),
                source=entry.get("extractor", ""),
                requester=requester,
            )
            tracks.append(track)
        return tracks

    async def create_source(self, track: TrackInfo) -> discord.AudioSource:
        """Create a PCM audio source for the provided TrackInfo."""
        from discord import FFmpegPCMAudio  # local import to avoid circular

        info = await asyncio.to_thread(self._ytdl.extract_info, track.webpage_url, download=False)
        if info is None:
            raise RuntimeError("Failed to retrieve audio source.")
        if "entries" in info:
            info = info["entries"][0]
        stream_url = info.get("url")
        if not stream_url:
            raise RuntimeError("Missing stream URL for track.")

        return FFmpegPCMAudio(
            stream_url,
            before_options="-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
            options="-vn",
        )

    @staticmethod
    def _pick_thumbnail(entry: dict) -> Optional[str]:
        """Choose the best thumbnail available in a yt-dlp result."""
        thumbs = entry.get("thumbnails")
        if isinstance(thumbs, list) and thumbs:
            return thumbs[-1].get("url") or thumbs[0].get("url")
        return entry.get("thumbnail")

    @staticmethod
    def _is_spotify_link(query: str) -> bool:
        """Return True if the query references Spotify."""
        return "spotify.com" in query.lower()
