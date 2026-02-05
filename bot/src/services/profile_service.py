"""Per-guild playback profile management."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import aiofiles

DEFAULT_PROFILE_PATH = Path("data/guild_profiles.json")
ANNOUNCEMENT_STYLES = ("rich", "minimal")


@dataclass
class GuildProfile:
    """User-adjustable playback defaults for a guild."""

    default_volume: int = 100
    autoplay: bool = False
    announcement_style: str = "rich"
    adaptive_mastering: bool = False
    compliance_mode: bool = False

    def validate(self) -> None:
        """Normalise values to safe bounds."""
        self.default_volume = max(0, min(200, int(self.default_volume)))
        if self.announcement_style not in ANNOUNCEMENT_STYLES:
            self.announcement_style = "rich"


@dataclass
class GuildProfileManager:
    """Load/save guild playback profiles from a JSON document."""

    path: Path = DEFAULT_PROFILE_PATH
    _profiles: dict[str, GuildProfile] = field(default_factory=dict, init=False)

    async def start(self) -> None:
        """Initialize the service and load persisted data."""
        await self.load()

    # ------------------------------------------------------------------ persistence helpers
    async def load(self) -> None:
        """Load all guild profiles from disk if present."""
        if self.path.exists():
            try:
                async with aiofiles.open(self.path, "r", encoding="utf-8") as f:
                    content = await f.read()
                data = json.loads(content)
            except (json.JSONDecodeError, OSError):
                data = {}
            raw: dict[str, dict[str, Any]] = data if isinstance(data, dict) else {}
            for guild_id, payload in raw.items():
                profile = GuildProfile(**payload)
                profile.validate()
                self._profiles[guild_id] = profile

    async def save(self) -> None:
        """Persist profiles to disk."""
        if not self.path.parent.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
        serialised = {gid: asdict(profile) for gid, profile in self._profiles.items()}
        async with aiofiles.open(self.path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(serialised, indent=2, sort_keys=True))

    # ------------------------------------------------------------------ profile management
    def get(self, guild_id: int) -> GuildProfile:
        """Return the profile for ``guild_id`` with defaults if missing."""
        key = str(guild_id)
        if key not in self._profiles:
            self._profiles[key] = GuildProfile()
        profile = self._profiles[key]
        profile.validate()
        return profile

    async def update(
        self,
        guild_id: int,
        *,
        volume: int | None = None,
        autoplay: bool | None = None,
        announcement_style: str | None = None,
        adaptive_mastering: bool | None = None,
        compliance_mode: bool | None = None,
    ) -> GuildProfile:
        """Mutate the stored profile and return the latest state."""
        profile = self.get(guild_id)
        if volume is not None:
            profile.default_volume = volume
        if autoplay is not None:
            profile.autoplay = autoplay
        if announcement_style is not None:
            profile.announcement_style = announcement_style
        if adaptive_mastering is not None:
            profile.adaptive_mastering = adaptive_mastering
        if compliance_mode is not None:
            profile.compliance_mode = compliance_mode
        profile.validate()
        await self.save()
        return profile
