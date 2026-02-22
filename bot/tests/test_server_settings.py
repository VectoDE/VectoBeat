"""
Tests for ServerSettingsService (src/services/server_settings_service.py).
Uses only pure/sync methods to avoid needing a real bot or event loop.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from src.services.server_settings_service import (
    ServerSettingsService,
    GuildSettingsState,
    DEFAULT_SERVER_SETTINGS,
)
from src.configs.schema import ControlPanelAPIConfig


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def svc():
    cfg = ControlPanelAPIConfig(
        enabled=True,
        base_url="https://vectobeat.test",
        api_key="test-key",
    )
    with patch("src.services.server_settings_service.get_plan_capabilities") as mock_plan:
        mock_plan.return_value = {
            "limits": {"queue": 200},
            "serverSettings": {
                "maxSourceAccessLevel": "unlimited",
                "maxPlaybackQuality": "hires",
                "maxAnalyticsMode": "predictive",
                "maxAutomationLevel": "full",
                "allowAutomationWindow": True,
                "allowedLavalinkRegions": ["auto", "eu", "us"],
                "multiSourceStreaming": True,
                "playlistSync": True,
                "aiRecommendations": True,
                "exportWebhooks": True,
            },
        }
        service = ServerSettingsService(cfg, default_prefix="!")
        yield service


# ─── _clamp_by_order ─────────────────────────────────────────────────────────

class TestClampByOrder:
    def test_returns_value_when_within_allowed(self):
        result = ServerSettingsService._clamp_by_order("smart", "full", ("off", "smart", "full"))
        assert result == "smart"

    def test_clamps_to_allowed_when_over(self):
        result = ServerSettingsService._clamp_by_order("full", "smart", ("off", "smart", "full"))
        assert result == "smart"

    def test_returns_allowed_for_unknown_value(self):
        result = ServerSettingsService._clamp_by_order("unknown", "off", ("off", "smart", "full"))
        assert result == "off"

    def test_off_is_minimum(self):
        result = ServerSettingsService._clamp_by_order("off", "full", ("off", "smart", "full"))
        assert result == "off"


# ─── _coerce_queue_limit ──────────────────────────────────────────────────────

class TestCoerceQueueLimit:
    def test_coerces_integer_string(self):
        assert ServerSettingsService._coerce_queue_limit("150") == 150

    def test_coerces_float(self):
        assert ServerSettingsService._coerce_queue_limit(99.9) == 99

    def test_returns_default_for_none(self):
        result = ServerSettingsService._coerce_queue_limit(None)
        assert result == DEFAULT_SERVER_SETTINGS["queueLimit"]

    def test_minimum_of_one(self):
        assert ServerSettingsService._coerce_queue_limit(0) == 1
        assert ServerSettingsService._coerce_queue_limit(-50) == 1


# ─── _default_state ──────────────────────────────────────────────────────────

class TestDefaultState:
    def test_returns_free_tier(self, svc):
        state = svc._default_state()
        assert state.tier == "free"

    def test_returns_copy_of_defaults(self, svc):
        state = svc._default_state()
        state.settings["queueLimit"] = 9999
        assert svc._default_state().settings["queueLimit"] == DEFAULT_SERVER_SETTINGS["queueLimit"]

    def test_signature_is_none(self, svc):
        assert svc._default_state().signature is None


# ─── invalidate ──────────────────────────────────────────────────────────────

class TestInvalidate:
    def test_removes_cache_entry(self, svc):
        state = GuildSettingsState(tier="pro", settings={}, signature="sig")
        import time
        svc._cache[12345] = (state, time.monotonic() + 300)
        svc.invalidate(12345)
        assert 12345 not in svc._cache

    def test_handles_missing_guild_gracefully(self, svc):
        # Should not raise
        svc.invalidate(99999)

    def test_handles_string_guild_id(self, svc):
        import time
        state = GuildSettingsState(tier="pro", settings={}, signature=None)
        svc._cache[456] = (state, time.monotonic() + 300)
        svc.invalidate("456")
        assert 456 not in svc._cache


# ─── branding_snapshot ───────────────────────────────────────────────────────

class TestBrandingSnapshot:
    def test_returns_defaults_when_no_cache(self, svc):
        snap = svc.branding_snapshot(None)
        assert "accent" in snap
        assert "prefix" in snap

    def test_reads_cached_accent(self, svc):
        import time
        state = GuildSettingsState(
            tier="pro",
            settings={**DEFAULT_SERVER_SETTINGS, "brandingAccentColor": "#ABCDEF"},
            signature=None,
        )
        svc._cache[777] = (state, time.monotonic() + 300)
        snap = svc.branding_snapshot(777)
        assert snap["accent"] == "#ABCDEF"

    def test_reads_cached_prefix(self, svc):
        import time
        state = GuildSettingsState(
            tier="pro",
            settings={**DEFAULT_SERVER_SETTINGS, "customPrefix": ">"},
            signature=None,
        )
        svc._cache[778] = (state, time.monotonic() + 300)
        snap = svc.branding_snapshot(778)
        assert snap["prefix"] == ">"


# ─── _state_from_payload ────────────────────────────────────────────────────

class TestStateFromPayload:
    def test_merges_with_defaults(self, svc):
        payload = {"tier": "pro", "settings": {"queueLimit": 250}, "signature": "abc"}
        state = svc._state_from_payload(payload)
        assert state.tier == "pro"
        assert state.settings["queueLimit"] == 250
        # defaults still present
        assert "customPrefix" in state.settings

    def test_uses_free_tier_fallback(self, svc):
        state = svc._state_from_payload({"settings": {}})
        assert state.tier == "free"

    def test_signature_preserved(self, svc):
        state = svc._state_from_payload({"settings": {}, "signature": "sig123"})
        assert state.signature == "sig123"
