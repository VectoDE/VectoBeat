"""Queue Copilot: lightweight queue hygiene, loudness smoothing, and premium slot protection."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Iterable, List, Optional, Tuple

import lavalink

from src.services.server_settings_service import ServerSettingsService


class QueueCopilotService:
    """Maintains healthy queues and smoother playback across guilds."""

    PREMIUM_TIERS = {"pro", "growth", "scale", "enterprise"}
    DEFAULT_TARGET_VOLUME = 100
    PREMIUM_SLOTS = 2
    TRACK_LIMITS_MS = {
        "free": 10 * 60 * 1000,
        "starter": 12 * 60 * 1000,
        "pro": 20 * 60 * 1000,
        "growth": None,
        "scale": None,
        "enterprise": None,
    }

    def __init__(self, settings: ServerSettingsService) -> None:
        self.settings = settings
        self.logger = logging.getLogger("VectoBeat.QueueCopilot")

    async def _tier(self, guild_id: int) -> str:
        try:
            state = await self.settings.get_settings(guild_id)
            return (state.tier or "free").lower()
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.debug("Failed to resolve tier for guild %s: %s", guild_id, exc)
            return "free"

    def _dedupe_queue(self, player: lavalink.DefaultPlayer) -> int:
        queue = list(getattr(player, "queue", []))
        seen = set()
        deduped: List[lavalink.AudioTrack] = []
        removed = 0
        for track in queue:
            identifier = getattr(track, "identifier", None) or getattr(track, "uri", None)
            if identifier and identifier in seen:
                removed += 1
                continue
            if identifier:
                seen.add(identifier)
            deduped.append(track)
        if removed:
            player.queue.clear()
            player.queue.extend(deduped)
        return removed

    def _trim_long_tracks(self, player: lavalink.DefaultPlayer, tier: str) -> int:
        limit_ms = self.TRACK_LIMITS_MS.get(tier, None)
        if not limit_ms:
            return 0

        queue = list(getattr(player, "queue", []))
        kept: List[lavalink.AudioTrack] = []
        trimmed = 0
        for track in queue:
            duration = getattr(track, "duration", 0) or 0
            if duration and duration > limit_ms:
                trimmed += 1
                continue
            kept.append(track)
        if trimmed:
            player.queue.clear()
            player.queue.extend(kept)
        return trimmed

    def _protect_premium_slots(self, player: lavalink.DefaultPlayer, tier: str) -> Tuple[int, int]:
        if tier not in self.PREMIUM_TIERS:
            return 0, 0
        queue = list(getattr(player, "queue", []))
        if not queue:
            return 0, 0

        reserved: List[lavalink.AudioTrack] = []
        spill: List[lavalink.AudioTrack] = []
        seen_requesters = set()
        moves = 0

        for idx, track in enumerate(queue):
            requester = getattr(track, "requester", None)
            key = requester if requester is not None else f"anon-{idx}"
            if len(reserved) < self.PREMIUM_SLOTS:
                if key in seen_requesters:
                    spill.append(track)
                    moves += 1
                    continue
                seen_requesters.add(key)
                reserved.append(track)
            else:
                spill.append(track)

        new_queue = reserved + spill
        if new_queue != queue:
            player.queue.clear()
            player.queue.extend(new_queue)
            moves = max(moves, 1)

        return len(reserved), moves

    async def on_tracks_added(
        self, player: lavalink.DefaultPlayer, added_tracks: Iterable[lavalink.AudioTrack], guild_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Apply hygiene immediately after tracks are added."""
        from typing import cast
        guild_id = cast(int, guild_id or getattr(player, "guild_id", 0) or 0)
        tier = await self._tier(guild_id)
        summary: Dict[str, Any] = {"tier": tier}
        removed = self._dedupe_queue(player)
        trimmed = self._trim_long_tracks(player, tier)
        reserved, moved = self._protect_premium_slots(player, tier)

        actions = []
        if removed:
            actions.append(f"deduped:{removed}")
        if trimmed:
            actions.append(f"trimmed:{trimmed}")
        if moved:
            actions.append(f"reserved:{reserved}")

        if actions:
            summary["actions"] = actions
        return summary

    async def on_track_start(self, player: lavalink.DefaultPlayer, _track: lavalink.AudioTrack) -> None:
        """Smooth volume and re-run hygiene when a track starts."""
        tier = await self._tier(getattr(player, "guild_id", 0))
        self._dedupe_queue(player)
        self._protect_premium_slots(player, tier)
        if player.fetch("auto_crossfade_active"):
            return
        await self._smooth_volume(player)

    async def _smooth_volume(self, player: lavalink.DefaultPlayer) -> None:
        """Clamp volume gently toward a sane target to avoid loudness spikes."""
        target = int(player.fetch("default_volume") or self.DEFAULT_TARGET_VOLUME)
        current = int(getattr(player, "volume", target) or target)
        if abs(target - current) <= 8:
            return

        steps = 8
        delta = (target - current) / steps
        delay = 0.05
        for _ in range(steps):
            current += delta
            vol = int(max(20, min(150, round(current))))
            try:
                await player.set_volume(vol)
            except Exception:
                return
            await asyncio.sleep(delay)
