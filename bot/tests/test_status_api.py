"""
Tests for StatusAPIService (src/services/status_api_service.py).
Focuses on event recording, auth enforcement, and push configuration.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from src.services.status_api_service import StatusAPIService
from src.configs.schema import StatusAPIConfig


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def cfg():
    return StatusAPIConfig(
        enabled=True,
        port=3051,
        api_key="test-api-key",
        push_endpoint="https://example.com/api/bot/metrics",
        push_token="test-push-token",
        event_endpoint="https://example.com/api/bot/events",
        usage_endpoint="https://example.com/api/bot/usage",
        push_interval_seconds=30,
        allow_unauthenticated=False,
    )


@pytest.fixture
def svc(cfg):
    with patch("src.services.status_api_service.CONFIG") as mock_cfg:
        mock_cfg.bot.command_prefix = "!"
        service = StatusAPIService(MagicMock(), cfg)
        service._http_session = MagicMock()
        yield service


# ─── record_command_event ─────────────────────────────────────────────────────

class TestRecordCommandEvent:
    def test_queues_event_dict(self, svc):
        svc.record_command_event(
            name="play",
            guild_id=123,
            shard_id=0,
            success=True,
        )
        assert svc._event_queue.qsize() >= 1

    def test_event_has_command_name(self, svc):
        svc.record_command_event(name="play", guild_id=1, shard_id=0, success=True)
        event = svc._event_queue.get_nowait()
        assert event.get("command") == "play" or event.get("name") == "play" or "play" in str(event)

    def test_multiple_events_queue(self, svc):
        for cmd in ["play", "skip", "stop"]:
            svc.record_command_event(name=cmd, guild_id=1, shard_id=0, success=True)
        assert svc._event_queue.qsize() == 3


# ─── record_incident ─────────────────────────────────────────────────────────

class TestRecordIncident:
    def test_queues_incident(self, svc):
        svc.record_incident(reason="lavalink_disconnected")
        assert svc._event_queue.qsize() >= 1

    def test_incident_has_type(self, svc):
        svc.record_incident(reason="timeout_error")
        item = svc._event_queue.get_nowait()
        assert "timeout_error" in str(item)


# ─── Auth Verification via Handlers ─────────────────────────────────────────────

@pytest.fixture
def mock_request():
    req = AsyncMock()
    req.headers = {}
    req.query = {}
    return req

class TestAuthVerification:
    @pytest.mark.asyncio
    async def test_valid_bearer_token_passes(self, svc, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-api-key"}
        # Should not return 401. If it returns standard response, status is 200 via json_response
        svc._snapshot = AsyncMock(return_value={"status": "ok"})
        resp = await svc._handle_status(mock_request)
        assert resp is not None
        # Assuming web.json_response isn't fully mocked, but we can mock it or check logic
        # Actually it returns a web.Response
        assert getattr(resp, "status", 200) == 200

    @pytest.mark.asyncio
    async def test_wrong_bearer_token_fails(self, svc, mock_request):
        mock_request.headers = {"Authorization": "Bearer wrong-key"}
        resp = await svc._handle_status(mock_request)
        assert resp.status == 401

    @pytest.mark.asyncio
    async def test_no_header_fails_when_auth_required(self, svc, mock_request):
        resp = await svc._handle_status(mock_request)
        assert resp.status == 401

    @pytest.mark.asyncio
    async def test_unauthenticated_allowed(self, cfg, mock_request):
        cfg.allow_unauthenticated = True
        with patch("src.services.status_api_service.CONFIG") as mock_cfg:
            mock_cfg.bot.command_prefix = "!"
            service = StatusAPIService(MagicMock(), cfg)
        service._snapshot = AsyncMock(return_value={"status": "ok"})
        resp = await service._handle_status(mock_request)
        assert getattr(resp, "status", 200) == 200


# ─── push endpoint configuration ─────────────────────────────────────────────

class TestPushConfiguration:
    def test_push_endpoint_configured(self, svc):
        assert svc._push_endpoint == "https://example.com/api/bot/metrics"

    def test_push_token_set(self, svc):
        assert svc._push_token == "test-push-token"

    def test_push_interval_set(self, svc):
        assert svc._push_interval == 30

    def test_event_endpoint_configured(self, svc):
        assert svc._event_endpoint == "https://example.com/api/bot/events"

    def test_usage_endpoint_configured(self, svc):
        assert svc._usage_endpoint == "https://example.com/api/bot/usage"
