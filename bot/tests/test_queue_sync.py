"""
Tests for QueueSyncService (src/services/queue_sync_service.py).
Uses mocks to avoid real aiohttp/lavalink connections.
"""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from src.services.queue_sync_service import QueueSyncService, SNAPSHOT_TIERS
from src.configs.schema import QueueSyncConfig


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def cfg_enabled():
    return QueueSyncConfig(enabled=True, endpoint="https://example.com/api/queue-sync", api_key="key")


@pytest.fixture
def cfg_disabled():
    return QueueSyncConfig(enabled=False, endpoint=None, api_key=None)


@pytest.fixture
def mock_settings():
    svc = MagicMock()
    svc.tier = AsyncMock(return_value="pro")
    return svc


@pytest.fixture
def mock_player():
    player = MagicMock()
    track = MagicMock()
    track.title = "Test Song"
    track.author = "Test Artist"
    track.duration = 180_000
    track.uri = "https://youtube.com/watch?v=test"
    track.artwork_url = None
    track.source_name = "youtube"
    track.requester = 123456789
    player.current = track
    player.queue = [track]
    player.paused = False
    player.volume = 100
    return player


# ─── _snapshot ────────────────────────────────────────────────────────────────

class TestSnapshot:
    def test_snapshot_includes_now_playing(self, mock_player):
        snap = QueueSyncService._snapshot(mock_player)
        assert snap["nowPlaying"] is not None
        assert snap["nowPlaying"]["title"] == "Test Song"

    def test_snapshot_includes_queue(self, mock_player):
        snap = QueueSyncService._snapshot(mock_player)
        assert len(snap["queue"]) == 1
        assert snap["queue"][0]["author"] == "Test Artist"

    def test_snapshot_paused_state(self, mock_player):
        mock_player.paused = True
        snap = QueueSyncService._snapshot(mock_player)
        assert snap["paused"] is True

    def test_snapshot_volume(self, mock_player):
        snap = QueueSyncService._snapshot(mock_player)
        assert snap["volume"] == 100

    def test_snapshot_no_current_track(self):
        player = MagicMock()
        player.current = None
        player.queue = []
        player.paused = False
        player.volume = 50
        snap = QueueSyncService._snapshot(player)
        assert snap["nowPlaying"] is None
        assert snap["queue"] == []

    def test_snapshot_requester_stringified(self, mock_player):
        snap = QueueSyncService._snapshot(mock_player)
        assert snap["nowPlaying"] is not None
        assert isinstance(snap["nowPlaying"]["requester"], str)


# ─── publish_state ────────────────────────────────────────────────────────────

class TestPublishState:
    @pytest.mark.asyncio
    async def test_disabled_service_does_not_queue(self, cfg_disabled, mock_settings, mock_player):
        svc = QueueSyncService(cfg_disabled, mock_settings)
        await svc.publish_state(123, mock_player, "track_started")
        assert svc._queue.qsize() == 0

    @pytest.mark.asyncio
    async def test_free_tier_does_not_queue(self, cfg_enabled, mock_settings, mock_player):
        mock_settings.tier = AsyncMock(return_value="free")
        svc = QueueSyncService(cfg_enabled, mock_settings)
        svc._session = MagicMock()  # pretend started
        await svc.publish_state(123, mock_player, "track_started")
        assert svc._queue.qsize() == 0

    @pytest.mark.asyncio
    async def test_pro_tier_queues_payload(self, cfg_enabled, mock_settings, mock_player):
        mock_settings.tier = AsyncMock(return_value="pro")
        svc = QueueSyncService(cfg_enabled, mock_settings)
        svc._session = MagicMock()  # pretend started
        await svc.publish_state(123, mock_player, "track_started")
        assert svc._queue.qsize() == 1

    @pytest.mark.asyncio
    async def test_backlog_limit_drops_payload(self, cfg_enabled, mock_settings, mock_player):
        mock_settings.tier = AsyncMock(return_value="pro")
        svc = QueueSyncService(cfg_enabled, mock_settings)
        svc._session = MagicMock()
        # Fill queue beyond MAX_QUEUE_DEPTH
        for _ in range(QueueSyncService.MAX_QUEUE_DEPTH):
            svc._queue.put_nowait({"guildId": "fill", "queue": []}) # type: ignore[typeddict-item]
        init_size = svc._queue.qsize()
        await svc.publish_state(123, mock_player, "overflow")
        # Queue should not have grown
        assert svc._queue.qsize() == init_size

    @pytest.mark.asyncio
    async def test_payload_contains_guild_id(self, cfg_enabled, mock_settings, mock_player):
        mock_settings.tier = AsyncMock(return_value="pro")
        svc = QueueSyncService(cfg_enabled, mock_settings)
        svc._session = MagicMock()
        await svc.publish_state(999, mock_player, "test")
        payload = svc._queue.get_nowait()
        assert payload["guildId"] == "999"


# ─── _post ────────────────────────────────────────────────────────────────────

class TestPost:
    @pytest.mark.asyncio
    async def test_sends_authorization_header(self, cfg_enabled, mock_settings):
        svc = QueueSyncService(cfg_enabled, mock_settings)

        captured_headers = {}

        def fake_post(url, json=None, headers=None):
            if headers:
                captured_headers.update(headers)
            cm = MagicMock()
            cm.__aenter__ = AsyncMock(return_value=MagicMock(status=200))
            cm.__aexit__ = AsyncMock(return_value=False)
            return cm

        svc._session = MagicMock()
        svc._session.post = fake_post
        payload = {"guildId": "123", "queue": [], "reason": "test", "metadata": {}}  # type: ignore[typeddict-item]
        await svc._post(payload) # type: ignore[arg-type]
        assert "Authorization" in captured_headers
        assert "Bearer key" in captured_headers["Authorization"]

    @pytest.mark.asyncio
    async def test_logs_warning_on_4xx(self, cfg_enabled, mock_settings, caplog):
        svc = QueueSyncService(cfg_enabled, mock_settings)

        resp_mock = MagicMock()
        resp_mock.status = 401
        resp_mock.text = AsyncMock(return_value="unauthorized")

        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=resp_mock)
        cm.__aexit__ = AsyncMock(return_value=False)

        svc._session = MagicMock()
        svc._session.post = MagicMock(return_value=cm)

        import logging
        with caplog.at_level(logging.WARNING, logger="VectoBeat.QueueSync"):
            payload = {"guildId": "123", "queue": [], "reason": "test", "metadata": {}}  # type: ignore[typeddict-item]
            await svc._post(payload) # type: ignore[arg-type]

        assert any("failed" in r.message.lower() for r in caplog.records)


# ─── SNAPSHOT_TIERS constant ─────────────────────────────────────────────────

class TestSnapshotTiers:
    def test_free_not_included(self):
        assert "free" not in SNAPSHOT_TIERS

    def test_pro_included(self):
        assert "pro" in SNAPSHOT_TIERS

    def test_enterprise_included(self):
        assert "enterprise" in SNAPSHOT_TIERS
