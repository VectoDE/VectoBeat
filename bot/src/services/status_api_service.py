"""Lightweight HTTP API that exposes live bot metrics to the frontend."""

from __future__ import annotations

import asyncio
import asyncio.subprocess
import json
import logging
from collections import deque
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import math
import time

import discord
from discord import app_commands
import lavalink
from aiohttp import ClientSession, web
from lavalink.events import TrackStartEvent

from src.configs.schema import StatusAPIConfig
from src.configs.settings import CONFIG
from src.services.health_service import HealthState
from src.services.lavalink_service import VectoPlayer


class StatusAPIService:
    """Serve JSON snapshots of guild, player, and command data for the frontend."""

    def __init__(self, bot: discord.Client, config: StatusAPIConfig):
        self.bot = bot
        self.config = config
        self.enabled = getattr(config, "enabled", False)
        self.logger = logging.getLogger("VectoBeat.StatusAPI")
        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None
        self._app: Optional[web.Application] = None
        self._cache: Dict[str, Any] = {"payload": None, "expires": 0.0}
        self._streams_total = 0
        self._lock = asyncio.Lock()
        self._command_events: deque[float] = deque()
        self._incident_events: deque[float] = deque()
        self._listener_events: deque[Tuple[float, int]] = deque()
        self._commands_total = 0
        self._incidents_total = 0
        self._usage_storage_path = Path(__file__).resolve().parents[2] / "data" / "bot_usage_totals.json"
        self._last_usage_persist = 0.0
        control_panel_base = getattr(CONFIG, "control_panel_api", None)
        cp_base_url = getattr(control_panel_base, "base_url", None)
        cp_api_key = getattr(control_panel_base, "api_key", None)
        self._push_endpoint = config.push_endpoint or (f"{cp_base_url.rstrip('/')}/api/bot/metrics" if cp_base_url else None)
        self._push_token = config.push_token or config.api_key or cp_api_key
        self._push_interval = max(10, int(getattr(config, "push_interval_seconds", 30)))
        self._event_endpoint = config.event_endpoint or (f"{cp_base_url.rstrip('/')}/api/bot/events" if cp_base_url else None)
        self._event_token = config.event_token or config.push_token or config.api_key or cp_api_key
        self._usage_endpoint = config.usage_endpoint or (f"{cp_base_url.rstrip('/')}/api/bot/usage" if cp_base_url else None)
        self._usage_token = config.usage_token or config.event_token or config.push_token or config.api_key or cp_api_key
        self._push_task: Optional[asyncio.Task] = None
        self._event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._event_worker: Optional[asyncio.Task] = None
        self._http_session: Optional[ClientSession] = None
        self._usage_sync_task: Optional[asyncio.Task] = None
        self._usage_sync_inflight = False
        self._usage_sync_pending = False
        self._online_since = datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if not self.enabled or self._runner:
            return

        self._register_lavalink_hooks()

        self._app = web.Application()
        self._app.router.add_get("/", self._handle_status)
        self._app.router.add_get("/status", self._handle_status)
        self._app.router.add_post("/reconcile-routing", self._handle_reconcile)
        self._app.router.add_post("/reconcile-settings", self._handle_reconcile_settings)
        self._app.router.add_post("/reconcile-defaults", self._handle_reconcile_defaults)
        self._app.router.add_post("/control/{action}", self._handle_control_action)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host=self.config.host, port=self.config.port)
        await self._site.start()
        self.logger.info("Status API listening on %s:%s", self.config.host, self.config.port)
        usage_bootstrapped = False
        if self._push_endpoint or self._event_endpoint or self._usage_endpoint:
            self._http_session = ClientSession()
            if self._usage_endpoint:
                usage_bootstrapped = await self._load_usage_totals()
            if not usage_bootstrapped:
                self._restore_usage_from_disk()
            await self._bootstrap_counters()
        else:
            self._restore_usage_from_disk()
        if self._push_endpoint:
            self._push_task = asyncio.create_task(self._push_loop())
        if self._event_endpoint:
            self._event_worker = asyncio.create_task(self._event_loop())

    async def close(self) -> None:
        if self._push_task:
            self._push_task.cancel()
            try:
                await self._push_task
            except asyncio.CancelledError:
                pass
            self._push_task = None
        if self._event_worker:
            self._event_worker.cancel()
            try:
                await self._event_worker
            except asyncio.CancelledError:
                pass
            self._event_worker = None
        if self._usage_sync_task:
            self._usage_sync_task.cancel()
            try:
                await self._usage_sync_task
            except asyncio.CancelledError:
                pass
            self._usage_sync_task = None
        if self._usage_endpoint and self._http_session:
            try:
                await self._send_usage_totals()
            except Exception:
                pass
        if self._http_session:
            await self._http_session.close()
            self._http_session = None
        if self._site:
            await self._site.stop()
            self._site = None
        if self._runner:
            await self._runner.cleanup()
            self._runner = None
        self._persist_usage()
        self._app = None

    # ------------------------------------------------------------------ lavalink hooks
    def _register_lavalink_hooks(self) -> None:
        client = getattr(self.bot, "lavalink", None)
        if not client:
            return
        client.add_event_hooks(self)

    @lavalink.listener()  # type: ignore[misc]
    async def on_track_start(self, event: TrackStartEvent):
        if not isinstance(event, TrackStartEvent):
            return
        player = getattr(event, "player", None)
        guild_id = getattr(player, "guild_id", None) if player else None
        if guild_id is None:
            return
        track_payload = self._track_payload(getattr(event, "track", None))
        self.record_stream_event(guild_id=guild_id, track=track_payload)

    # ------------------------------------------------------------------ request handlers
    async def _handle_status(self, request: web.Request) -> web.Response:
        if self.config.api_key and not self.config.allow_unauthenticated:
            auth_header = request.headers.get("Authorization")
            token = request.query.get("token") or request.query.get("key") or request.query.get("api_key")
            if auth_header != f"Bearer {self.config.api_key}" and token != self.config.api_key:
                return web.json_response({"error": "unauthorized"}, status=401)

        payload = await self._snapshot()
        return web.json_response(payload)

    async def _snapshot(self) -> Dict[str, Any]:
        loop = asyncio.get_running_loop()
        now = loop.time()
        if self._cache["payload"] and self._cache["expires"] > now:
            return self._cache["payload"]

        async with self._lock:
            current = loop.time()
            if self._cache["payload"] and self._cache["expires"] > current:
                return self._cache["payload"]
            payload = self._build_payload()
            # Persist uptime frequently so offline gaps are reflected in uptimePercent after restarts.
            try:
                HealthState.persist()
            except Exception:
                pass
            ttl = max(1, int(self.config.cache_ttl_seconds or 5))
            self._cache = {
                "payload": payload,
                "expires": current + ttl,
            }
            return payload

    # ------------------------------------------------------------------ helpers
    def _latency_snapshot(self) -> Tuple[float, float, float, Dict[int, float], Optional[float]]:
        monitor = getattr(self.bot, "latency_monitor", None)
        if monitor:
            snap = monitor.snapshot()
            return snap.average, snap.best, snap.p95, snap.shards, snap.loop_lag_ms

        shard_pairs: List[Tuple[int, Optional[float]]] = getattr(self.bot, "latencies", [])
        shard_lookup: Dict[int, float] = {}
        latencies_ms: List[float] = []
        for shard_id, latency in shard_pairs:
            latency_ms = self._safe_float(latency, 0.0) * 1000
            shard_lookup[shard_id] = round(latency_ms, 2)
            latencies_ms.append(latency_ms)
        if not latencies_ms:
            fallback = self._safe_float(getattr(self.bot, "latency", 0.0), 0.0) * 1000
            latencies_ms = [fallback]
            shard_lookup[0] = round(fallback, 2)

        sorted_vals = sorted(latencies_ms)
        best = sorted_vals[0]
        avg = statistics.mean(sorted_vals)
        p95 = sorted_vals[max(0, int(0.95 * (len(sorted_vals) - 1)))]
        return avg, best, p95, shard_lookup, None

    def _build_payload(self) -> Dict[str, Any]:
        self._prune_events()
        guilds = getattr(self.bot, "guilds", [])
        guild_ids = [str(guild.id) for guild in guilds]
        guild_payload = [
            {
                "id": str(guild.id),
                "name": guild.name,
                "memberCount": guild.member_count or len(getattr(guild, "members", [])) or 0,
                "icon": guild.icon.url if getattr(guild, "icon", None) else None,
            }
            for guild in guilds
        ]
        lavalink_client = getattr(self.bot, "lavalink", None)
        players = list(lavalink_client.player_manager.players.values()) if lavalink_client else []
        active_players = sum(1 for player in players if getattr(player, "is_playing", False))
        queue_tracks = sum(len(getattr(player, "queue", [])) for player in players)
        voice_connections, listener_count, listener_detail = self._voice_snapshot()
        self._record_listener_sample(listener_count)
        listener_peak_24h, listener_sum_24h = self._listener_window()
        latency_avg_ms, latency_best_ms, latency_p95_ms, shard_lookup, loop_lag_ms = self._latency_snapshot()
        shards, shards_online, shards_total = self._build_shard_snapshot(shard_lookup)
        commands, categories = self._command_reference()
        uptime_seconds = round(HealthState.uptime(), 2)
        uptime_percent = round(HealthState.uptime_percent(), 2)
        listener_map = {int(detail["guildId"]): detail["listeners"] for detail in listener_detail}
        player_states = self._player_states(players, listener_map)
        commands_24h = len(self._command_events)
        incidents_24h = len(self._incident_events)

        payload: Dict[str, Any] = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "guildCount": len(guilds),
            "guildIds": guild_ids,
            "guilds": guild_payload,
            "servers": guild_payload,
            "players": self._safe_int(len(players)),
            "activePlayers": self._safe_int(active_players),
            "listeners": self._safe_int(listener_count),
            "currentListeners": self._safe_int(listener_count),
            "activeListeners": self._safe_int(listener_count),
            "queueTracks": self._safe_int(queue_tracks),
            "queueLength": self._safe_int(queue_tracks),
            "voiceConnections": self._safe_int(voice_connections),
            "activeVoice": self._safe_int(voice_connections),
            "connectedVoiceChannels": self._safe_int(voice_connections),
            "listeners24h": listener_sum_24h,
            "listenerPeak24h": listener_peak_24h,
            "totalStreams": self._streams_total,
            "streams": self._streams_total,
            "streamCount": self._streams_total,
            "uptimeSeconds": uptime_seconds,
            "uptime": uptime_seconds,
            "uptimePercent": uptime_percent,
            "uptimePercentage": uptime_percent,
            "uptime_percent": uptime_percent,
            "latency": round(latency_avg_ms, 2),
            "averageLatency": round(latency_avg_ms, 2),
            "latencyMs": round(latency_avg_ms, 2),
            "latencyBest": round(latency_best_ms, 2),
            "latencyP95": round(latency_p95_ms, 2),
            "loopLagMs": round(loop_lag_ms, 2) if loop_lag_ms is not None else None,
            "shardsOnline": shards_online,
            "shardsTotal": shards_total,
            "shardCount": shards_total,
            "shards": shards,
            "incidents24h": incidents_24h,
            "incidents": incidents_24h,
            "incidentsTotal": self._incidents_total,
            "commands24h": commands_24h,
            "commandCount24h": commands_24h,
            "commandsTotal": self._commands_total,
            "commands": commands,
            "commandReference": categories,
            "commandCategories": categories,
            "playersDetail": player_states,
            "listenerDetail": listener_detail,
            "isOnline": True,
            "onlineSince": self._online_since,
        }

        if lavalink_client:
            payload["nodes"] = [
                {
                    "name": node.name,
                    "available": node.available,
                    "players": self._safe_int(node.stats.players if node.stats else 0),
                    "playingPlayers": self._safe_int(node.stats.playing_players if node.stats else 0),
                    "region": getattr(node, "region", None),
                }
                for node in lavalink_client.node_manager.nodes
            ]

        payload["latency"] = round(self._safe_float(payload.get("latency"), 0.0), 2)
        payload["averageLatency"] = payload["latency"]
        payload["latencyMs"] = payload["latency"]
        return self._sanitize(payload)

    def record_command(self, *, success: bool) -> None:
        if not self.enabled:
            return
        now = time.time()
        self._command_events.append(now)
        self._commands_total += 1
        self._prune_events(now)
        if not success:
            self.record_incident(reason="command_error", timestamp=now, persist=False)
        self._trigger_usage_sync()

    def record_command_event(
        self,
        *,
        name: Optional[str],
        success: bool,
        guild_id: Optional[int],
        shard_id: Optional[int],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.record_command(success=success)
        self._queue_event(
            {
                "type": "command",
                "name": name,
                "success": success,
                "guildId": str(guild_id) if guild_id else None,
                "shardId": shard_id,
                "metadata": metadata,
                "ts": int(time.time()),
            }
        )

    def record_incident(
        self, *, reason: Optional[str] = None, timestamp: Optional[float] = None, persist: bool = True
    ) -> None:
        if not self.enabled:
            return
        now = timestamp or time.time()
        self._incident_events.append(now)
        self._incidents_total += 1
        self._prune_events(now)
        if persist:
            self._trigger_usage_sync()
        self._queue_event(
            {
                "type": "incident",
                "reason": reason,
                "ts": int(now),
            }
        )

    def record_stream_event(
        self,
        *,
        guild_id: int,
        track: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._streams_total += 1
        self._trigger_usage_sync()
        self._queue_event(
            {
                "type": "stream",
                "guildId": str(guild_id),
                "track": track,
                "ts": int(time.time()),
            }
        )

    def _prune_events(self, now: Optional[float] = None) -> None:
        if not self._command_events and not self._incident_events and not self._listener_events:
            return
        cutoff = (now or time.time()) - 86_400
        while self._command_events and self._command_events[0] < cutoff:
            self._command_events.popleft()
        while self._incident_events and self._incident_events[0] < cutoff:
            self._incident_events.popleft()
        while self._listener_events and self._listener_events[0][0] < cutoff:
            self._listener_events.popleft()

    def _trigger_usage_sync(self) -> None:
        if not self._usage_endpoint or not self._http_session:
            self._persist_usage()
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._usage_sync_inflight:
            self._usage_sync_pending = True
            return
        self._usage_sync_inflight = True
        self._usage_sync_task = loop.create_task(self._push_usage_totals())

    async def _push_usage_totals(self) -> None:
        try:
            await self._send_usage_totals()
        finally:
            self._usage_sync_inflight = False
            if self._usage_sync_pending:
                self._usage_sync_pending = False
                self._trigger_usage_sync()

    async def _send_usage_totals(self) -> None:
        if not self._usage_endpoint or not self._http_session:
            self._persist_usage()
            return
        headers = {"Content-Type": "application/json"}
        if self._usage_token:
            headers["Authorization"] = f"Bearer {self._usage_token}"
        payload = {
            "totalStreams": self._streams_total,
            "commandsTotal": self._commands_total,
            "incidentsTotal": self._incidents_total,
        }
        try:
            async with self._http_session.post(self._usage_endpoint, json=payload, headers=headers, timeout=5) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.warning("Bot usage totals push failed (%s): %s", resp.status, text[:200])
                else:
                    self._persist_usage(force=True)
        except Exception as exc:
            self.logger.warning("Bot usage totals transport error: %s", exc)

    async def _load_usage_totals(self) -> bool:
        if not self._usage_endpoint or not self._http_session:
            return False
        headers = {"Accept": "application/json"}
        if self._usage_token:
            headers["Authorization"] = f"Bearer {self._usage_token}"
        try:
            async with self._http_session.get(self._usage_endpoint, headers=headers, timeout=5) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.debug("Failed to load usage totals (%s): %s", resp.status, text[:200])
                    return False
                payload = await resp.json()
        except Exception as exc:
            self.logger.debug("Usage totals bootstrap failed: %s", exc)
            return False

        totals = payload.get("totals") if isinstance(payload, dict) else None
        if not isinstance(totals, dict):
            totals = payload if isinstance(payload, dict) else None
        if not isinstance(totals, dict):
            return False
        streams = totals.get("totalStreams")
        commands_total = totals.get("commandsTotal")
        incidents_total = totals.get("incidentsTotal")
        try:
            if isinstance(streams, (int, float)) and streams > self._streams_total:
                self._streams_total = int(streams)
            if isinstance(commands_total, (int, float)) and commands_total > self._commands_total:
                self._commands_total = int(commands_total)
            if isinstance(incidents_total, (int, float)) and incidents_total > self._incidents_total:
                self._incidents_total = int(incidents_total)
        except Exception:
            return False
        self._persist_usage(force=True)
        return True

    def _queue_event(self, payload: Dict[str, Any]) -> None:
        if not self._event_endpoint or not self._http_session:
            return
        try:
            self._event_queue.put_nowait(payload)
        except asyncio.QueueFull:
            self.logger.warning("Dropping bot event due to full queue.")

    async def _push_loop(self) -> None:
        await self.bot.wait_until_ready()
        while True:
            try:
                payload = self._build_payload()
                await self._publish_payload(payload)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self.logger.warning("Failed to push bot metrics: %s", exc)
            await asyncio.sleep(self._push_interval)

    async def _bootstrap_counters(self) -> None:
        """Seed counters from the control panel so they persist across bot restarts."""
        if not self._push_endpoint or not self._http_session:
            return
        try:
            async with self._http_session.get(
                self._push_endpoint.replace("/api/bot/metrics", "/api/bot/metrics"),
                headers={"Authorization": f"Bearer {self._push_token}"} if self._push_token else None,
                timeout=5,
            ) as resp:
                if resp.status >= 400:
                    return
                payload = await resp.json()
        except Exception:
            return

        snapshot = payload.get("snapshot") if isinstance(payload, dict) else None
        if not isinstance(snapshot, dict):
            return
        streams = snapshot.get("totalStreams")
        commands_total = snapshot.get("commandsTotal")
        incidents_total = snapshot.get("incidentsTotal")
        updated = False
        try:
            if isinstance(streams, (int, float)) and streams > self._streams_total:
                self._streams_total = int(streams)
                updated = True
            if isinstance(commands_total, (int, float)) and commands_total > self._commands_total:
                self._commands_total = int(commands_total)
                updated = True
            elif commands_total is None:
                legacy_commands = snapshot.get("commands24h") or snapshot.get("commands")
                if isinstance(legacy_commands, (int, float)) and legacy_commands > self._commands_total:
                    self._commands_total = int(legacy_commands)
                    updated = True
            if isinstance(incidents_total, (int, float)) and incidents_total > self._incidents_total:
                self._incidents_total = int(incidents_total)
                updated = True
        except Exception:
            return

    async def _publish_payload(self, payload: Dict[str, Any]) -> None:
        if not self._push_endpoint or not self._http_session:
            return
        headers = {"Content-Type": "application/json"}
        if self._push_token:
            headers["Authorization"] = f"Bearer {self._push_token}"
        try:
            async with self._http_session.post(self._push_endpoint, json=payload, headers=headers, timeout=10) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.warning("Bot metrics push failed (%s): %s", resp.status, text[:200])
        except Exception as exc:
            self.logger.warning("Bot metrics push transport error: %s", exc)

    async def _event_loop(self) -> None:
        while True:
            try:
                event = await self._event_queue.get()
                await self._send_event(event)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self.logger.warning("Bot event push error: %s", exc)

    async def _send_event(self, event: Dict[str, Any]) -> None:
        if not self._event_endpoint or not self._http_session:
            return
        headers = {"Content-Type": "application/json"}
        if self._event_token:
            headers["Authorization"] = f"Bearer {self._event_token}"
        try:
            async with self._http_session.post(self._event_endpoint, json=event, headers=headers, timeout=5) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    self.logger.warning("Bot event push failed (%s): %s", resp.status, text[:200])
        except Exception as exc:
            self.logger.warning("Bot event transport error: %s", exc)

    async def _reapply_all_server_policies(self) -> None:
        """Re-apply playback/queue policies to all active players."""
        players = list(getattr(self.bot.lavalink.player_manager, "players", {}).values())
        for player in players:
            await self._reapply_guild_server_policies(player.guild_id)

    async def _reapply_guild_server_policies(self, guild_id: int) -> None:
        """Apply current control-panel settings (volume/quality/queue) to a guild's player."""
        player = self.bot.lavalink.player_manager.get(guild_id)
        if not player:
            return
        settings_service = getattr(self.bot, "server_settings", None)
        profile_manager = getattr(self.bot, "profile_manager", None)
        if settings_service:
            try:
                state = await settings_service.get_settings(guild_id)
            except Exception:
                state = None
        else:
            state = None

        # Playback quality
        quality_source = state.settings if state else {}
        quality = str(quality_source.get("playbackQuality") or "standard").lower()
        cached = player.fetch("playback_quality_mode")
        if quality != cached:
            player.store("playback_quality_mode", quality)
            try:
                if quality == "hires":
                    await player.remove_filter(lavalink.LowPass)
                else:
                    await player.set_filter(lavalink.LowPass(smoothing=20.0))
            except Exception as exc:  # pragma: no cover - best effort
                self.logger.debug("Failed to reapply playback quality for guild %s: %s", guild_id, exc)

        # Volume defaults
        desired_volume = None
        if settings_service:
            desired_volume = settings_service.global_default_volume()
        if desired_volume is None and profile_manager:
            try:
                profile = profile_manager.get(guild_id)
                desired_volume = getattr(profile, "default_volume", None)
            except Exception:
                desired_volume = None
        if desired_volume is not None and player.volume != desired_volume:
            try:
                await player.set_volume(int(desired_volume))
            except Exception as exc:  # pragma: no cover - best effort
                self.logger.debug("Failed to set desired volume for guild %s: %s", guild_id, exc)

        # Queue limits: trim if the queue exceeds the current cap.
        try:
            raw_limit = settings_service._coerce_queue_limit(state.settings.get("queueLimit") if state else None) if settings_service else None
            plan_cap = settings_service._plan_queue_cap(state.tier if state else "free") if settings_service else None
            if raw_limit is not None:
                effective_limit = min(raw_limit, plan_cap) if plan_cap else raw_limit
                queue = getattr(player, "queue", None)
                if queue is not None and len(queue) > effective_limit:
                    # keep the earliest items, drop the overflow
                    overflow = len(queue) - effective_limit
                    del queue[-overflow:]
                    self.logger.info(
                        "Trimmed queue to %s items for guild %s after settings update (dropped %s).",
                        effective_limit,
                        guild_id,
                        overflow,
                    )
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.debug("Failed to reconcile queue limit for guild %s: %s", guild_id, exc)

    def _player_states(self, players: List[VectoPlayer], listener_map: Dict[int, int]) -> List[Dict[str, Any]]:
        states: List[Dict[str, Any]] = []
        settings_service = getattr(self.bot, "server_settings", None)
        for player in players:
            guild = self.bot.get_guild(player.guild_id)
            track = getattr(player, "current", None)
            listeners = listener_map.get(player.guild_id, 0)
            node = getattr(player, "node", None)
            desired_region = None
            if settings_service:
                state = settings_service.cached_state(player.guild_id)
                desired_region = str(state.settings.get("lavalinkRegion") or "auto").lower()
            states.append(
                {
                    "guildId": str(player.guild_id),
                    "guildName": guild.name if guild else None,
                    "isPlaying": bool(getattr(player, "is_playing", False)),
                    "queueLength": self._safe_int(len(getattr(player, "queue", []))),
                    "textChannelId": str(getattr(player, "text_channel_id", "")) if getattr(player, "text_channel_id", None) else None,
                    "voiceChannelId": str(getattr(player, "channel_id", "")) if getattr(player, "channel_id", None) else None,
                    "currentTrack": self._track_payload(track),
                    "listeners": self._safe_int(listeners),
                    "nodeName": getattr(node, "name", None),
                    "nodeRegion": getattr(node, "region", None),
                    "desiredRegion": desired_region,
                }
            )
        return states

    async def _handle_reconcile(self, request: web.Request) -> web.Response:
        if self.config.api_key and not self.config.allow_unauthenticated:
            auth_header = request.headers.get("Authorization")
            token = request.query.get("token") or request.query.get("key") or request.query.get("api_key")
            if auth_header != f"Bearer {self.config.api_key}" and token != self.config.api_key:
                return web.json_response({"error": "unauthorized"}, status=401)
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        guild_id = payload.get("guildId")
        if isinstance(guild_id, str):
            guild_id = guild_id.strip()
        try:
            resolved_guild = int(guild_id)
        except (TypeError, ValueError):
            return web.json_response({"error": "guild_required"}, status=400)

        settings_service = getattr(self.bot, "server_settings", None)
        if settings_service:
            settings_service.invalidate(resolved_guild)

        regional_service = getattr(self.bot, "regional_routing", None)
        if regional_service:
            await regional_service.reconcile_guild(resolved_guild)

        return web.json_response({"ok": True})

    async def _handle_reconcile_settings(self, request: web.Request) -> web.Response:
        if self.config.api_key and not self.config.allow_unauthenticated:
            auth_header = request.headers.get("Authorization")
            token = request.query.get("token") or request.query.get("key") or request.query.get("api_key")
            if auth_header != f"Bearer {self.config.api_key}" and token != self.config.api_key:
                return web.json_response({"error": "unauthorized"}, status=401)

        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)

        guild_id = payload.get("guildId")
        if isinstance(guild_id, str):
            guild_id = guild_id.strip()
        try:
            resolved_guild = int(guild_id)
        except (TypeError, ValueError):
            return web.json_response({"error": "guild_required"}, status=400)

        settings_service = getattr(self.bot, "server_settings", None)
        if settings_service:
            settings_service.invalidate(resolved_guild)
            try:
                await settings_service.get_settings(resolved_guild)
            except Exception as exc:  # pragma: no cover - best-effort warmup
                self.logger.debug("Settings prefetch failed for guild %s: %s", resolved_guild, exc)
            await self._reapply_guild_server_policies(resolved_guild)

        return web.json_response({"ok": True})

    async def _handle_reconcile_defaults(self, request: web.Request) -> web.Response:
        if self.config.api_key and not self.config.allow_unauthenticated:
            auth_header = request.headers.get("Authorization")
            token = request.query.get("token") or request.query.get("key") or request.query.get("api_key")
            if auth_header != f"Bearer {self.config.api_key}" and token != self.config.api_key:
                return web.json_response({"error": "unauthorized"}, status=401)

        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)

        discord_id = payload.get("discordId") or payload.get("discord_id")
        settings = payload.get("settings") if isinstance(payload, dict) else None
        settings_service = getattr(self.bot, "server_settings", None)
        if settings_service and isinstance(settings, dict):
            try:
                settings_service.invalidate_all()
                await settings_service.refresh_global_defaults(discord_id, settings)
                await self._reapply_all_server_policies()
            except Exception as exc:  # pragma: no cover - best effort
                self.logger.warning("Failed to apply global defaults: %s", exc)
        return web.json_response({"ok": True})

    async def _handle_control_action(self, request: web.Request) -> web.Response:
        if self.config.api_key and not self.config.allow_unauthenticated:
            auth_header = request.headers.get("Authorization")
            token = request.query.get("token") or request.query.get("key") or request.query.get("api_key")
            if auth_header != f"Bearer {self.config.api_key}" and token != self.config.api_key:
                return web.json_response({"error": "unauthorized"}, status=401)

        action = (request.match_info.get("action") or "").lower().strip()
        if not action:
            return web.json_response({"error": "action_required"}, status=400)

        try:
            payload = await request.json()
        except Exception:
            payload = {}

        # Map common aliases to our internal operations or configured commands.
        # reload-commands must always run the in-process Discord sync, never a shell command.
        if action in {"reload-commands", "reload_commands"}:
            await self._reload_commands()
        elif action in {"reload", "reload-config", "reload_config"}:
            await self._run_or_fallback(self.config.control_reload_cmd, self._reload_configuration)
        elif action in {"restart-frontend", "restart_frontend"}:
            await self._run_or_fallback(self.config.control_restart_frontend_cmd, self._noop)
        elif action in {"start", "start-bot", "start_bot"}:
            await self._run_or_fallback(self.config.control_start_cmd, self._noop)
        elif action in {"stop", "stop-bot", "stop_bot"}:
            await self._run_or_fallback(self.config.control_stop_cmd, self._noop)
        elif action in {"hot-patch", "hot_patch"}:
            # Zero-downtime patch: reload config + extensions without restart.
            await self._reload_configuration()
            await self._reload_commands()
        else:
            return web.json_response({"error": "unknown_action"}, status=400)

        return web.json_response({"ok": True, "action": action, "payload": payload})

    async def _reload_configuration(self) -> None:
        """Invalidate caches/config and reconcile routing without full restart."""
        settings_service = getattr(self.bot, "server_settings", None)
        if settings_service:
            settings_service.invalidate_all()
        routing_service = getattr(self.bot, "regional_routing", None)
        if routing_service:
            try:
                await routing_service.reconcile_all()
            except Exception as exc:  # pragma: no cover - best-effort logging
                self.logger.warning("Routing reconcile during reload failed: %s", exc)
        search_cache = getattr(self.bot, "search_cache", None)
        if search_cache and hasattr(search_cache, "clear"):
            try:
                search_cache.clear()
            except Exception:
                pass
        # Drop status payload cache so next poll refreshes metrics
        self._cache = {"payload": None, "expires": 0.0}

    async def _reload_commands(self) -> None:
        """Reload bot extensions and resync slash commands to Discord."""
        bot = getattr(self, "bot", None)
        if not bot:
            return
        # Reload all loaded extensions to pick up code/config changes.
        try:
            extensions = list(getattr(bot, "extensions", {}).keys())
            for ext in extensions:
                try:
                    await bot.reload_extension(ext)
                except Exception as exc:
                    self.logger.warning("Failed to reload extension %s: %s", ext, exc)
        except Exception as exc:
            self.logger.warning("Extension reload sweep failed: %s", exc)
        # Resync application commands to Discord.
        sync_fn = getattr(bot, "_sync_application_commands", None)
        if callable(sync_fn):
            try:
                await sync_fn()
                self.logger.info("Slash commands re-synced after control action.")
            except Exception as exc:
                self.logger.warning("Slash command resync failed: %s", exc)
        else:
            self.logger.warning("Bot does not expose _sync_application_commands; skipping resync.")

    async def _run_or_fallback(self, command: Optional[str], fallback):
        """Run a shell command when provided, otherwise use a Python fallback."""
        if command:
            await self._run_shell(command)
        else:
            await fallback()

    async def _run_shell(self, command: str) -> None:
        """Execute a shell command; log errors but do not raise to the caller."""
        try:
            proc = await asyncio.subprocess.create_subprocess_shell(command)
            await proc.communicate()
            if proc.returncode != 0:
                self.logger.warning("Control command failed (%s) exit=%s", command, proc.returncode)
        except Exception as exc:
            self.logger.warning("Control command error for '%s': %s", command, exc)

    async def _noop(self) -> None:
        return None

    @staticmethod
    def _track_payload(track: Optional[lavalink.AudioTrack]) -> Optional[Dict[str, Any]]:
        if not track:
            return None
        return {
            "title": getattr(track, "title", None),
            "author": getattr(track, "author", None),
            "identifier": getattr(track, "identifier", None),
            "uri": getattr(track, "uri", None),
            "duration": getattr(track, "duration", None),
        }

    def _build_shard_snapshot(self, snapshot: Optional[Dict[int, float]] = None) -> Tuple[List[Dict[str, Any]], int, int]:
        if snapshot:
            latencies: List[Tuple[int, Optional[float]]] = [(sid, lat / 1000.0) for sid, lat in snapshot.items()]
        else:
            latencies = getattr(self.bot, "latencies", [])
        shards: List[Dict[str, Any]] = []
        online = 0
        total = self.bot.shard_count or len(latencies) or 1

        if latencies:
            for shard_id, latency in latencies:
                latency_ms = round(float(latency or 0) * 1000, 2)
                is_online = latency is not None and latency < float("inf")
                if is_online:
                    online += 1
                shards.append(
                    {
                        "id": shard_id,
                        "latency": latency_ms,
                        "online": is_online,
                    }
                )
        else:
            latency_ms = round(float(self.bot.latency or 0) * 1000, 2)
            shards.append({"id": 0, "latency": latency_ms, "online": True})
            online = 1

        return shards, online, total

    @staticmethod
    def _safe_int(value: Any, fallback: int = 0) -> int:
        try:
            number = int(value)
        except (TypeError, ValueError):
            return fallback
        return number

    @staticmethod
    def _safe_float(value: Any, fallback: float = 0.0) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return fallback
        if math.isnan(number) or math.isinf(number):
            return fallback
        return number

    def _sanitize(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {key: self._sanitize(val) for key, val in value.items()}
        if isinstance(value, list):
            return [self._sanitize(item) for item in value]
        if isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return 0.0
            return round(value, 6)
        return value

    def _command_reference(self) -> Tuple[List[Dict[str, str]], Dict[str, List[Dict[str, str]]]]:
        commands: List[Dict[str, str]] = []
        categories: Dict[str, List[Dict[str, str]]] = {}
        tree = getattr(self.bot, "tree", None)
        if not tree:
            return commands, categories

        for command in tree.walk_commands():
            name = f"/{command.qualified_name}"
            description = command.description or ""
            category = self._derive_category(command)
            entry = {
                "name": name,
                "description": description,
                "category": category,
            }
            commands.append(entry)
            categories.setdefault(category, []).append(
                {
                    "name": name,
                    "description": description,
                }
            )

        commands.sort(key=lambda item: item["name"])
        for values in categories.values():
            values.sort(key=lambda item: item["name"])
        return commands, categories

    @staticmethod
    def _derive_category(command: app_commands.Command) -> str:
        cog_name = getattr(command, "cog_name", None)
        if isinstance(cog_name, str) and cog_name:
            return cog_name.replace("_", " ").title()
        module = getattr(command, "module", None)
        if isinstance(module, str) and module:
            suffix = module.split(".")[-1]
            if suffix:
                return suffix.replace("_", " ").title()
        return "General"
    def _voice_snapshot(self) -> Tuple[int, int, List[Dict[str, Any]]]:
        voice_clients: List[discord.VoiceClient] = list(getattr(self.bot, "voice_clients", []))
        connections = len(voice_clients)
        listener_total = 0
        detail: List[Dict[str, Any]] = []
        for vc in voice_clients:
            channel = getattr(vc, "channel", None)
            if not channel:
                continue
            guild = channel.guild
            members = getattr(channel, "members", []) or []
            listeners = sum(1 for member in members if not getattr(member, "bot", False) and member.id != getattr(self.bot.user, "id", None))
            listener_total += listeners
            detail.append(
                {
                    "guildId": str(guild.id),
                    "channelId": str(getattr(channel, "id", "")),
                    "listeners": self._safe_int(listeners),
                }
            )
        return connections, listener_total, detail

    def _record_listener_sample(self, count: int) -> None:
        now = time.time()
        self._listener_events.append((now, max(0, int(count))))
        self._prune_events(now)

    def _listener_window(self) -> Tuple[int, int]:
        if not self._listener_events:
            return 0, 0
        peak = max(count for _, count in self._listener_events)
        total = sum(count for _, count in self._listener_events)
        return peak, total

    def _restore_usage_from_disk(self) -> bool:
        path = self._usage_storage_path
        if not path:
            return False
        try:
            if not path.exists():
                return False
            content = path.read_text(encoding="utf-8").strip()
            if not content:
                return False
            payload = json.loads(content)
        except Exception:
            return False
        updated = False
        streams = payload.get("totalStreams")
        commands_total = payload.get("commandsTotal")
        incidents_total = payload.get("incidentsTotal")
        if isinstance(streams, (int, float)) and streams > self._streams_total:
            self._streams_total = int(streams)
            updated = True
        if isinstance(commands_total, (int, float)) and commands_total > self._commands_total:
            self._commands_total = int(commands_total)
            updated = True
        if isinstance(incidents_total, (int, float)) and incidents_total > self._incidents_total:
            self._incidents_total = int(incidents_total)
            updated = True
        return updated

    def _persist_usage(self, force: bool = False) -> None:
        path = self._usage_storage_path
        if not path:
            return
        now = time.time()
        if not force and (now - self._last_usage_persist) < 5.0:
            return
        self._last_usage_persist = now
        payload = {
            "totalStreams": int(self._streams_total),
            "commandsTotal": int(self._commands_total),
            "incidentsTotal": int(self._incidents_total),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload), encoding="utf-8")
        except Exception:
            pass
