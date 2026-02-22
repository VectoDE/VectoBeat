"""
Tests for configuration schema validation (src/configs/schema.py).
Ensures default values, field validators and AppConfig parsing are correct.
"""

import pytest
from src.configs.schema import (
    StatusAPIConfig,
    ControlPanelAPIConfig,
    LavalinkConfig,
    BotConfig,
    BotIntents,
    RedisConfig,
    QueueSyncConfig,
    AppConfig,
)


# ─── StatusAPIConfig ───────────────────────────────────────────────────────────

class TestStatusAPIConfig:
    def test_default_port(self):
        cfg = StatusAPIConfig()
        assert cfg.port == 3051

    def test_default_enabled(self):
        cfg = StatusAPIConfig()
        assert cfg.enabled is True

    def test_default_allow_unauthenticated_false(self):
        cfg = StatusAPIConfig()
        assert cfg.allow_unauthenticated is False

    def test_custom_values(self):
        cfg = StatusAPIConfig(
            port=9999,
            api_key="secret",
            push_endpoint="https://example.com/api/bot/metrics",
            push_token="push-secret",
            push_interval_seconds=60,
        )
        assert cfg.port == 9999
        assert cfg.api_key == "secret"
        assert cfg.push_endpoint == "https://example.com/api/bot/metrics"
        assert cfg.push_token == "push-secret"
        assert cfg.push_interval_seconds == 60

    def test_optional_fields_default_none(self):
        cfg = StatusAPIConfig()
        assert cfg.api_key is None
        assert cfg.push_endpoint is None
        assert cfg.event_endpoint is None
        assert cfg.usage_endpoint is None


# ─── ControlPanelAPIConfig ────────────────────────────────────────────────────

class TestControlPanelAPIConfig:
    def test_default_disabled(self):
        cfg = ControlPanelAPIConfig()
        assert cfg.enabled is False

    def test_default_base_url(self):
        cfg = ControlPanelAPIConfig()
        assert "127.0.0.1" in cfg.base_url or "localhost" in cfg.base_url

    def test_custom_base_url(self):
        cfg = ControlPanelAPIConfig(enabled=True, base_url="https://vectobeat.test")
        assert cfg.base_url == "https://vectobeat.test"


# ─── LavalinkConfig ───────────────────────────────────────────────────────────

class TestLavalinkConfig:
    def test_default_port(self):
        cfg = LavalinkConfig()
        assert cfg.port == 2333

    def test_string_strip_validator(self):
        cfg = LavalinkConfig(host="  127.0.0.1  ", name="  main  ")
        assert cfg.host == "127.0.0.1"
        assert cfg.name == "main"


# ─── BotConfig ────────────────────────────────────────────────────────────────

class TestBotConfig:
    def test_default_intents(self):
        cfg = BotConfig()
        assert cfg.intents.members is False
        assert cfg.intents.message_content is False

    def test_custom_intents(self):
        cfg = BotConfig(intents=BotIntents(members=True))
        assert cfg.intents.members is True


# ─── RedisConfig ──────────────────────────────────────────────────────────────

class TestRedisConfig:
    def test_defaults(self):
        cfg = RedisConfig()
        assert cfg.host == "127.0.0.1"
        assert cfg.port == 6379
        assert cfg.db == 0
        assert cfg.password is None


# ─── QueueSyncConfig ─────────────────────────────────────────────────────────

class TestQueueSyncConfig:
    def test_default_disabled(self):
        cfg = QueueSyncConfig()
        assert cfg.enabled is False

    def test_with_endpoint(self):
        cfg = QueueSyncConfig(enabled=True, endpoint="https://example.com/api/queue-sync", api_key="k")
        assert cfg.enabled is True
        assert cfg.api_key == "k"


# ─── AppConfig ───────────────────────────────────────────────────────────────

class TestAppConfig:
    def test_empty_dict_uses_defaults(self):
        cfg = AppConfig()
        assert cfg.status_api.enabled is True
        assert cfg.control_panel_api.enabled is False

    def test_nested_override(self):
        cfg = AppConfig(status_api=StatusAPIConfig(port=4444))
        assert cfg.status_api.port == 4444
