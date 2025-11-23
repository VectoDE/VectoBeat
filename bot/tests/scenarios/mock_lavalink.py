"""Mock Lavalink primitives used by the scenario harness."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class MockTrack:
    """Lightweight track representation that mirrors the lavalink API we use."""

    title: str
    author: str
    duration: int
    uri: str
    identifier: str
    requester: Optional[int] = None


@dataclass
class MockLoadResult:
    tracks: List[MockTrack]
    load_type: str = "SEARCH_RESULT"


class MockPlayer:
    """Minimal player with queue semantics matching DefaultPlayer."""

    def __init__(self, guild_id: int):
        self.guild_id = guild_id
        self.queue: List[MockTrack] = []
        self.current: Optional[MockTrack] = None
        self.is_playing = False

    def add(self, track: MockTrack):
        self.queue.append(track)

    def clear(self):
        self.queue.clear()
        self.current = None
        self.is_playing = False

    def play(self):
        if not self.queue:
            raise RuntimeError("No tracks queued")
        self.current = self.queue.pop(0)
        self.is_playing = True
        return self.current

    def skip(self):
        if not self.is_playing:
            raise RuntimeError("Nothing playing")
        if self.queue:
            self.current = self.queue.pop(0)
            return self.current
        self.is_playing = False
        self.current = None
        return None


class MockPlayerManager:
    def __init__(self):
        self.players: Dict[int, MockPlayer] = {}

    def create(self, guild_id: int) -> MockPlayer:
        player = MockPlayer(guild_id)
        self.players[guild_id] = player
        return player

    def get(self, guild_id: int) -> MockPlayer:
        return self.players[guild_id]


class MockLavalink:
    """Provides predictable results for get_tracks and mocked players."""

    def __init__(self):
        self.player_manager = MockPlayerManager()
        self._search_results: Dict[str, List[MockTrack]] = {}

    def register_search(self, query: str, tracks: List[MockTrack]):
        self._search_results[query] = tracks

    def get_tracks(self, query: str) -> MockLoadResult:
        tracks = self._search_results.get(query)
        if tracks is None:
            raise KeyError(f"No mock tracks registered for query '{query}'")
        return MockLoadResult(tracks=list(tracks))
