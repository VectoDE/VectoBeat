"""Client for synchronising control-panel server settings into the bot."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Set, Tuple, Union

import aiohttp

from src.configs.schema import ControlPanelAPIConfig
from src.utils.plan_capabilities import get_plan_capabilities
from src.utils.tracks import source_name

DEFAULT_SERVER_SETTINGS: Dict[str, Any] = {
    "multiSourceStreaming": False,
    "sourceAccessLevel": "core",
    "playbackQuality": "standard",
    "autoCrossfade": False,
    "lavalinkRegion": "auto",
    "queueLimit": 100,
    "collaborativeQueue": True,
    "playlistSync": False,
    "analyticsMode": "basic",
    "aiRecommendations": False,
    "exportWebhooks": False,
    "automationLevel": "off",
    "automationWindow": "",
    "webhookEvents": [],
    "moderatorAlerts": True,
    "incidentEscalation": False,
    "priorityCare": False,
    "whiteLabelBranding": False,
    "compliancePack": False,
    "customPrefix": "!",
    "brandingAccentColor": "#FF4D6D",
    "apiTokens": [],
    "customDomain": "",
    "customDomainStatus": "unconfigured",
    "customDomainDnsRecord": "",
    "customDomainVerifiedAt": None,
    "customDomainTlsStatus": "pending",
    "assetPackUrl": "",
    "mailFromAddress": "",
}

SOURCE_ACCESS_POLICIES: Dict[str, Optional[Set[str]]] = {
    "core": {
        "youtube",
        "youtubemusic",
        "soundcloud",
        "spotify",
        "deezer",
    },
    "extended": {
        "youtube",
        "youtubemusic",
        "soundcloud",
        "spotify",
        "deezer",
        "bandcamp",
        "applemusic",
        "vimeo",
        "mixcloud",
        "twitch",
        "amazonmusic",
        "tidal",
        "napster",
        "beatport",
        "audius",
    },
    "unlimited": None,
}


@dataclass
class GuildSettingsState:
    """Cached per-guild settings."""

    tier: str
    settings: Dict[str, Any]
    signature: Optional[str]


@dataclass
class QueueCapacity:
    """Result detailing whether queue additions are allowed."""

    allowed: bool
    limit: int
    remaining: int
    tier: str

    def plan_label(self) -> str:
        """Return a human-readable tier label."""
        return self.tier.capitalize() or "Free"


@dataclass
class PanelParitySnapshot:
    """Mirrors how control-panel settings are applied inside the bot."""

    guild_id: int
    tier: str
    raw_queue_limit: int
    effective_queue_limit: int
    plan_queue_cap: Optional[int]
    raw_region: str
    effective_region: str
    allowed_regions: Tuple[str, ...]
    raw_automation_mode: str
    automation_mode: str
    allowed_automation_mode: str
    branding_accent: str
    prefix: str
    white_label: bool


class ServerSettingsService:
    """Fetch and cache server configuration exposed via the control panel."""

    def __init__(self, config: ControlPanelAPIConfig, default_prefix: str = "!"):
        self.config = config
        self.enabled = bool(config.enabled and config.base_url)
        self.logger = logging.getLogger("VectoBeat.ServerSettings")
        self._session: Optional[aiohttp.ClientSession] = None
        self._cache: Dict[int, tuple[GuildSettingsState, float]] = {}
        self._locks: Dict[int, asyncio.Lock] = {}
        self._endpoint = "/api/bot/server-settings"
        self.default_prefix = default_prefix or "!"
        self._default_brand_color = DEFAULT_SERVER_SETTINGS["brandingAccentColor"]
        self._global_defaults: Dict[str, Any] = {}
        self._defaults_path = Path("data/bot_defaults.json")
        self._restore_global_defaults()

    async def start(self) -> None:
        """Initialise the HTTP session."""
        if not self.enabled or self._session:
            return
        timeout = aiohttp.ClientTimeout(total=max(3, self.config.timeout_seconds))
        self._session = aiohttp.ClientSession(timeout=timeout)
        self.logger.info(
            "Control panel settings enabled (cache=%ss).",
            max(5, self.config.cache_ttl_seconds),
        )

    async def close(self) -> None:
        """Dispose of the HTTP session and cache."""
        if self._session:
            await self._session.close()
            self._session = None
        self._cache.clear()
        self._locks.clear()
        self._global_defaults.clear()

    def invalidate_all(self) -> None:
        """Drop all cached guild settings and global defaults."""
        self._cache.clear()
        self._global_defaults.clear()
        self._persist_global_defaults()

    async def get_settings(self, guild_id: int) -> GuildSettingsState:
        """Return cached settings for ``guild_id``."""
        if not guild_id:
            return self._default_state()
        if not self.enabled or not self._session:
            return self._default_state()

        now = time.monotonic()
        cached = self._cache.get(guild_id)
        if cached and cached[1] > now:
            return cached[0]

        lock = self._locks.setdefault(guild_id, asyncio.Lock())
        async with lock:
            cached = self._cache.get(guild_id)
            if cached and cached[1] > time.monotonic():
                return cached[0]
            state = await self._fetch_remote(guild_id)
            ttl = max(5, self.config.cache_ttl_seconds)
            self._cache[guild_id] = (state, time.monotonic() + ttl)
            return state

    async def tier(self, guild_id: int) -> str:
        """Return the cached membership tier for ``guild_id``."""
        state = await self.get_settings(guild_id)
        tier = state.tier or "free"
        return tier.lower()

    async def refresh_global_defaults(self, discord_id: Optional[str], settings: Dict[str, Any]) -> None:
        """Update in-memory defaults pushed from the control panel."""
        self._global_defaults = settings or {}
        self._persist_global_defaults()
        self.logger.info("Updated global defaults from control panel for user=%s", discord_id)

    def global_default_volume(self) -> Optional[int]:
        """Return global default volume if configured via control panel defaults."""
        value = self._global_defaults.get("defaultVolume") or self._global_defaults.get("default_volume")
        try:
            number = int(value)  # type: ignore[arg-type]
            return max(0, min(200, number))
        except Exception:
            return None

    async def allows_ai_recommendations(self, guild_id: int) -> bool:
        """Return True if AI recommendations are enabled for the guild."""
        state = await self.get_settings(guild_id)
        plan = get_plan_capabilities(state.tier or "free")
        if not plan.get("serverSettings", {}).get("aiRecommendations"):
            return False
        return bool(state.settings.get("aiRecommendations"))

    async def is_collaborative(self, guild_id: int) -> bool:
        """Return True if collaborative queues are enabled for ``guild_id``."""
        state = await self.get_settings(guild_id)
        value = state.settings.get("collaborativeQueue")
        return bool(value)

    async def analytics_mode(self, guild_id: int) -> str:
        """Return the analytics mode configured for ``guild_id``."""
        state = await self.get_settings(guild_id)
        plan = get_plan_capabilities(state.tier or "free")
        allowed = plan.get("serverSettings", {}).get("maxAnalyticsMode", "basic")
        mode = str(state.settings.get("analyticsMode") or "basic").lower()
        return self._clamp_by_order(mode, allowed, ("basic", "advanced", "predictive"))

    async def automation_mode(self, guild_id: int) -> str:
        """Return the automation level configured for ``guild_id``."""
        state = await self.get_settings(guild_id)
        plan = get_plan_capabilities(state.tier or "free")
        allowed = plan.get("serverSettings", {}).get("maxAutomationLevel", "off")
        mode = str(state.settings.get("automationLevel") or "off").lower()
        return self._clamp_by_order(mode, allowed, ("off", "smart", "full"))

    async def automation_window(self, guild_id: int) -> Optional[Tuple[int, int]]:
        """Return automation window minutes (start, end) if configured."""
        state = await self.get_settings(guild_id)
        plan = get_plan_capabilities(state.tier or "free")
        if not plan.get("serverSettings", {}).get("allowAutomationWindow"):
            return None
        raw = str(state.settings.get("automationWindow") or "").strip()
        if not raw or "-" not in raw:
            return None
        start, end = raw.split("-", 1)
        try:
            start_minutes = self._parse_minutes(start)
            end_minutes = self._parse_minutes(end)
        except ValueError:
            return None
        return start_minutes, end_minutes

    async def lavalink_region(self, guild_id: int) -> str:
        """Return preferred lavalink region for guild."""
        state = await self.get_settings(guild_id)
        plan = get_plan_capabilities(state.tier or "free")
        allowed = plan.get("serverSettings", {}).get("allowedLavalinkRegions", ["auto"])
        value = str(state.settings.get("lavalinkRegion") or "auto").lower()
        return value if value in allowed else (allowed[0] if allowed else "auto")

    @staticmethod
    def _parse_minutes(value: str) -> int:
        hours, minutes = value.split(":")
        hour_int = int(hours)
        minute_int = int(minutes)
        if not (0 <= hour_int <= 23 and 0 <= minute_int <= 59):
            raise ValueError
        return hour_int * 60 + minute_int

    async def webhook_preferences(self, guild_id: int) -> tuple[bool, set[str]]:
        """Return whether webhooks are enabled and which events are allowed."""
        state = await self.get_settings(guild_id)
        enabled = bool(state.settings.get("exportWebhooks"))
        events = state.settings.get("webhookEvents")
        if isinstance(events, list):
            allowed = {str(value).strip() for value in events if isinstance(value, str)}
        else:
            allowed = set()
        return enabled, allowed

    async def check_queue_capacity(
        self,
        guild_id: int,
        *,
        existing_tracks: int,
        tracks_to_add: int,
    ) -> QueueCapacity:
        """Verify whether ``tracks_to_add`` may be enqueued."""
        state = await self.get_settings(guild_id)
        limit = self._coerce_queue_limit(state.settings.get("queueLimit"))
        plan_cap = self._plan_queue_cap(state.tier or "free")
        if plan_cap is not None and limit > plan_cap:
            self.logger.debug(
                "Queue limit %s exceeds plan cap %s for guild %s; enforcing plan cap.",
                limit,
                plan_cap,
                guild_id,
            )
            limit = plan_cap
        existing = max(0, int(existing_tracks))
        to_add = max(0, int(tracks_to_add))
        remaining = max(0, limit - existing)
        allowed = to_add <= remaining
        return QueueCapacity(
            allowed=allowed,
            limit=limit,
            remaining=remaining,
            tier=state.tier or "free",
        )

    async def source_policy(self, guild_id: int) -> Tuple[str, Optional[Set[str]]]:
        state = await self.get_settings(guild_id)
        base_level = str(state.settings.get("sourceAccessLevel", "core")).lower()
        multi_source_enabled = bool(state.settings.get("multiSourceStreaming"))
        level = base_level if multi_source_enabled else "core"
        allowed = SOURCE_ACCESS_POLICIES.get(level)
        if allowed is None:
            return level, None
        return level, set(allowed)

    async def filter_tracks_for_guild(self, guild_id: int, tracks: Iterable[Any]) -> Tuple[list[Any], Optional[Set[str]], str]:
        snapshot = list(tracks)
        level, allowed = await self.source_policy(guild_id)
        if not allowed:
            return snapshot, None, level
        filtered = [track for track in snapshot if source_name(track) in allowed]
        return filtered, allowed, level

    async def parity_snapshot(self, guild_id: int) -> PanelParitySnapshot:
        """Return how a guild's control-panel settings map to bot behaviour."""
        state = await self.get_settings(guild_id)
        tier = state.tier or "free"
        plan = get_plan_capabilities(tier)
        plan_settings = plan.get("serverSettings", {}) or {}
        allowed_regions_raw = plan_settings.get("allowedLavalinkRegions") or ["auto"]
        allowed_regions = tuple(str(value).lower() for value in allowed_regions_raw)
        plan_queue_cap = self._plan_queue_cap(tier)

        raw_queue = self._coerce_queue_limit(state.settings.get("queueLimit"))
        effective_queue = min(raw_queue, plan_queue_cap) if plan_queue_cap is not None else raw_queue

        raw_region = str(state.settings.get("lavalinkRegion") or "auto").lower()
        effective_region = raw_region if raw_region in allowed_regions else (allowed_regions[0] if allowed_regions else "auto")

        raw_automation = str(state.settings.get("automationLevel") or "off").lower()
        allowed_automation = str(plan_settings.get("maxAutomationLevel") or "off").lower()
        automation_mode = self._clamp_by_order(raw_automation, allowed_automation, ("off", "smart", "full"))

        branding_accent = str(state.settings.get("brandingAccentColor") or self._default_brand_color)
        prefix = str(state.settings.get("customPrefix") or self.default_prefix)
        white_label = bool(state.settings.get("whiteLabelBranding"))

        return PanelParitySnapshot(
            guild_id=guild_id,
            tier=tier,
            raw_queue_limit=raw_queue,
            effective_queue_limit=effective_queue,
            plan_queue_cap=plan_queue_cap,
            raw_region=raw_region,
            effective_region=effective_region,
            allowed_regions=allowed_regions,
            raw_automation_mode=raw_automation,
            automation_mode=automation_mode,
            allowed_automation_mode=allowed_automation,
            branding_accent=branding_accent,
            prefix=prefix,
            white_label=white_label,
        )

    @staticmethod
    def _clamp_by_order(value: str, allowed: str, order: Tuple[str, ...]) -> str:
        """Clamp an ordered string value to the allowed maximum."""
        try:
            value_index = order.index(value)
        except ValueError:
            value_index = -1
        try:
            allowed_index = order.index(allowed)
        except ValueError:
            allowed_index = -1
        if value_index == -1 or allowed_index == -1:
            return allowed
        return value if value_index <= allowed_index else allowed

    async def update_settings(self, guild_id: int, updates: Dict[str, Any]) -> Optional[GuildSettingsState]:
        """Persist updates via the control-panel API and refresh the cache."""
        if not self.enabled or not self._session or not updates:
            return None
        payload = {"guildId": str(guild_id), "settings": updates}
        response = await self._post_json(payload)
        if not response:
            return None
        state = self._state_from_payload(response)
        ttl = max(5, self.config.cache_ttl_seconds)
        self._cache[guild_id] = (state, time.monotonic() + ttl)
        await self.verify_settings(guild_id, state.signature)
        return state

    async def verify_settings(self, guild_id: int, signature: Optional[str] = None) -> None:
        """Notify the API which signature we're currently applying."""
        if not self.enabled or not self._session:
            return
        if signature is None:
            cached = self._cache.get(guild_id)
            signature = cached[0].signature if cached else None
        if not signature:
            return
        payload = {"guildId": str(guild_id), "signature": signature}
        response = await self._post_json(payload)
        if not response:
            return
        matches = bool(response.get("matches"))
        if not matches:
            expected = response.get("signature")
            self.logger.warning(
                "Server settings drift detected for guild %s (local=%s remote=%s).",
                guild_id,
                signature,
                expected,
            )

    def invalidate(self, guild_id: Union[int, str]) -> None:
        """Evict cached settings for ``guild_id`` to force a refresh on next access."""
        try:
            resolved = int(guild_id)
        except (TypeError, ValueError):
            return
        if resolved in self._cache:
            self._cache.pop(resolved, None)

    async def prefix_for_guild(self, guild_id: int) -> str:
        """Return the configured command prefix for ``guild_id``."""
        state = await self.get_settings(guild_id)
        prefix = str(state.settings.get("customPrefix") or self.default_prefix).strip()
        return prefix or self.default_prefix

    def cached_state(self, guild_id: Optional[int]) -> GuildSettingsState:
        """Return cached settings for ``guild_id`` without triggering a fetch."""
        if not guild_id:
            return self._default_state()
        cached = self._cache.get(guild_id)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        return self._default_state()

    def branding_snapshot(self, guild_id: Optional[Union[int, str]]) -> Dict[str, str]:
        """Return accent color and prefix data for embeds."""
        resolved: Optional[int]
        try:
            resolved = int(guild_id) if guild_id is not None else None
        except (TypeError, ValueError):
            resolved = None
        state = self.cached_state(resolved)
        accent = str(state.settings.get("brandingAccentColor") or self._default_brand_color)
        prefix = str(state.settings.get("customPrefix") or self.default_prefix)
        white_label = bool(state.settings.get("whiteLabelBranding"))
        custom_domain = str(state.settings.get("customDomain") or "")
        asset_pack = str(state.settings.get("assetPackUrl") or "")
        mail_from = str(state.settings.get("mailFromAddress") or "")
        return {
            "accent": accent,
            "prefix": prefix,
            "white_label": white_label,
            "custom_domain": custom_domain,
            "asset_pack": asset_pack,
            "mail_from": mail_from,
            "embed_logo": str(state.settings.get("embedLogoUrl") or ""),
            "embed_cta_label": str(state.settings.get("embedCtaLabel") or ""),
            "embed_cta_url": str(state.settings.get("embedCtaUrl") or ""),
            "embed_accent": str(state.settings.get("embedAccentColor") or ""),
        }

    # ------------------------------------------------------------------ helpers
    async def _fetch_remote(self, guild_id: int) -> GuildSettingsState:
        """Call the control-panel API for fresh settings."""
        if not self._session:
            return self._default_state()
        base = self.config.base_url.rstrip("/")
        url = f"{base}{self._endpoint}?guildId={guild_id}"
        headers = self._headers()
        try:
            async with self._session.get(url, headers=headers) as resp:
                if resp.status == 404:
                    return self._default_state()
                if resp.status >= 400:
                    body = (await resp.text())[:200]
                    self.logger.warning(
                        "Server settings fetch failed for %s (%s): %s",
                        guild_id,
                        resp.status,
                        body,
                    )
                    return self._default_state()
                payload = await resp.json()
        except aiohttp.ClientError as exc:
            self.logger.error("Server settings request failed for %s: %s", guild_id, exc)
            return self._default_state()

        raw_settings = payload.get("settings")
        tier = str(payload.get("tier") or "free").lower()
        if not isinstance(raw_settings, dict):
            return self._default_state()
        state = self._state_from_payload(payload)
        await self.verify_settings(guild_id, state.signature)
        return state

    def _default_state(self) -> GuildSettingsState:
        return GuildSettingsState(tier="free", settings=dict(DEFAULT_SERVER_SETTINGS), signature=None)

    @staticmethod
    def _coerce_queue_limit(value: Any) -> int:
        try:
            limit = int(value)
        except (TypeError, ValueError):
            limit = DEFAULT_SERVER_SETTINGS["queueLimit"]
        return max(1, limit)

    def _plan_queue_cap(self, tier: str) -> Optional[int]:
        plan = get_plan_capabilities(tier or "free")
        raw_value = plan.get("limits", {}).get("queue")
        if isinstance(raw_value, int):
            return max(1, int(raw_value))
        return None

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def _post_json(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self._session:
            return None
        base = self.config.base_url.rstrip("/")
        url = f"{base}{self._endpoint}"
        headers = self._headers()
        try:
            async with self._session.post(url, json=payload, headers=headers) as resp:
                if resp.status >= 400:
                    body = (await resp.text())[:200]
                    self.logger.warning(
                        "Server settings POST failed for guild %s (%s): %s",
                        payload.get("guildId"),
                        resp.status,
                        body,
                    )
                    return None
                return await resp.json()
        except aiohttp.ClientError as exc:
            self.logger.error("Server settings POST error for guild %s: %s", payload.get("guildId"), exc)
            return None

    def _state_from_payload(self, payload: Dict[str, Any]) -> GuildSettingsState:
        settings_obj = payload.get("settings") or {}
        tier = str(payload.get("tier") or "free").lower()
        merged = {**DEFAULT_SERVER_SETTINGS, **settings_obj}
        signature = payload.get("signature")
        if isinstance(signature, str):
            sig_value: Optional[str] = signature
        else:
            sig_value = None
        return GuildSettingsState(tier=tier, settings=merged, signature=sig_value)

    # ------------------------------------------------------------------ global default persistence helpers
    def _restore_global_defaults(self) -> None:
        """Load last-applied global defaults from disk so they survive restarts."""
        try:
            if self._defaults_path.exists():
                raw = json.loads(self._defaults_path.read_text("utf-8"))
                if isinstance(raw, dict):
                    self._global_defaults = raw
                    self.logger.info("Restored %s global bot defaults from disk.", len(raw))
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.warning("Failed to restore global defaults: %s", exc)

    def _persist_global_defaults(self) -> None:
        """Persist global defaults to disk for reuse after bot restarts."""
        try:
            if not self._defaults_path.parent.exists():
                self._defaults_path.parent.mkdir(parents=True, exist_ok=True)
            self._defaults_path.write_text(json.dumps(self._global_defaults, indent=2, sort_keys=True), "utf-8")
        except Exception as exc:  # pragma: no cover - best-effort persistence
            self.logger.debug("Unable to persist global defaults: %s", exc)
