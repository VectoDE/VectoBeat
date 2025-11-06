"""Per-guild playback profile management."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict

DEFAULT_PROFILE_PATH = Path("data/guild_profiles.json")
ANNOUNCEMENT_STYLES = ("rich", "minimal")


@dataclass
class GuildProfile:
    """User-adjustable playback defaults for a guild."""

    default_volume: int = 100
    autoplay: bool = False
    announcement_style: str = "rich"

    def validate(self) -> None:
        """Normalise values to safe bounds."""
        self.default_volume = max(0, min(200, int(self.default_volume)))
        if self.announcement_style not in ANNOUNCEMENT_STYLES:
            self.announcement_style = "rich"


@dataclass
class GuildProfileManager:
    """Load/save guild playback profiles from a JSON document."""

    path: Path = field(default_factory=lambda: DEFAULT_PROFILE_PATH)
    _profiles: Dict[str, GuildProfile] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self.load()

    # ------------------------------------------------------------------ persistence helpers
    def load(self) -> None:
        """Load all guild profiles from disk if present."""
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text("utf-8"))
            except json.JSONDecodeError:
                raw = {}
            for guild_id, payload in raw.items():
                profile = GuildProfile(**payload)
                profile.validate()
                self._profiles[guild_id] = profile

    def save(self) -> None:
        """Persist profiles to disk."""
        if not self.path.parent.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
        serialised = {gid: asdict(profile) for gid, profile in self._profiles.items()}
        self.path.write_text(json.dumps(serialised, indent=2, sort_keys=True), "utf-8")

    # ------------------------------------------------------------------ profile management
    def get(self, guild_id: int) -> GuildProfile:
        """Return the profile for ``guild_id`` with defaults if missing."""
        key = str(guild_id)
        if key not in self._profiles:
            self._profiles[key] = GuildProfile()
        profile = self._profiles[key]
        profile.validate()
        return profile

    def update(self, guild_id: int, *, volume: int | None = None, autoplay: bool | None = None, announcement_style: str | None = None) -> GuildProfile:
        """Mutate the stored profile and return the latest state."""
        profile = self.get(guild_id)
        if volume is not None:
            profile.default_volume = volume
        if autoplay is not None:
            profile.autoplay = autoplay
        if announcement_style is not None:
            profile.announcement_style = announcement_style
        profile.validate()
        self.save()
        return profile

    def remove(self, guild_id: int) -> None:
        """Delete the stored profile for ``guild_id``."""
        key = str(guild_id)
        if key in self._profiles:
            del self._profiles[key]
            self.save()
