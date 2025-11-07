"""Scenario runner for queue + playback validation using mock Lavalink."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import yaml

from .mock_lavalink import MockLavalink, MockTrack


class ScenarioAssertionError(RuntimeError):
    pass


class ScenarioRunner:
    def __init__(self, guild_id: int = 1):
        self.guild_id = guild_id
        self.lavalink = MockLavalink()
        self.player = self.lavalink.player_manager.create(guild_id)
        self.tracks: Dict[str, MockTrack] = {}

    def load(self, path: str | Path) -> dict:
        data = yaml.safe_load(Path(path).read_text("utf-8"))
        if not isinstance(data, dict) or "steps" not in data:
            raise ValueError("Scenario must be a mapping with a 'steps' list")
        return data

    def run(self, path: str | Path) -> None:
        scenario = self.load(path)
        for idx, step in enumerate(scenario["steps"], start=1):
            action = step.get("action")
            if not action:
                raise ValueError(f"Step {idx} missing action")
            handler = getattr(self, f"_step_{action}", None)
            if not handler:
                raise ValueError(f"Unknown action '{action}' at step {idx}")
            handler(step)

    # ------------------------------------------------------------------ steps
    def _step_register_track(self, step: dict):
        alias = step["alias"]
        track = MockTrack(
            title=step["title"],
            author=step.get("author", "unknown"),
            duration=int(step.get("duration", 0)),
            uri=step.get("uri", ""),
            identifier=step.get("identifier", alias),
        )
        self.tracks[alias] = track

    def _step_mock_search(self, step: dict):
        query = step["query"]
        track_aliases: List[str] = step["tracks"]
        tracks = [self._require_track(alias) for alias in track_aliases]
        self.lavalink.register_search(query, tracks)

    def _step_enqueue(self, step: dict):
        alias = step["track"]
        track = self._require_track(alias)
        self.player.add(track)

    def _step_play(self, step: dict):
        track = self.player.play()
        expect = step.get("expect")
        if expect and track.identifier != self._require_track(expect).identifier:
            raise ScenarioAssertionError(f"Expected {expect} but playing {track.identifier}")

    def _step_skip(self, step: dict):
        self.player.skip()

    def _step_assert(self, step: dict):
        if "queue_length" in step:
            actual = len(self.player.queue)
            if actual != int(step["queue_length"]):
                raise ScenarioAssertionError(
                    f"Queue length {actual} != expected {step['queue_length']}"
                )
        if "current" in step:
            expected_alias = step["current"]
            track = self.player.current
            if not track or track.identifier != self._require_track(expected_alias).identifier:
                raise ScenarioAssertionError(
                    f"Current track mismatch (expected {expected_alias}, got {track.identifier if track else 'None'})"
                )

    def _step_dump_state(self, step: dict):
        path = Path(step.get("path", "scenario_state.json"))
        state = {
            "current": self.player.current.identifier if self.player.current else None,
            "queue": [track.identifier for track in self.player.queue],
        }
        path.write_text(json.dumps(state, indent=2), "utf-8")

    # ------------------------------------------------------------------ helpers
    def _require_track(self, alias: str) -> MockTrack:
        if alias not in self.tracks:
            raise KeyError(f"Track alias '{alias}' not registered")
        return self.tracks[alias]
