"""Helpers for working with Lavalink track metadata."""

from __future__ import annotations

from typing import Union, TYPE_CHECKING

if TYPE_CHECKING:
    from lavalink import AudioTrack, DeferredAudioTrack

def source_name(track: Union["AudioTrack", "DeferredAudioTrack"]) -> str:
    """Return the lower-case source identifier for a Lavalink track."""

    raw = getattr(track, "source_name", None) or getattr(track, "sourceName", None)
    if isinstance(raw, str):
        return raw.lower()
    return "unknown"
