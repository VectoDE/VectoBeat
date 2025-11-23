"""Lightweight HTTP API that exposes live bot metrics to the frontend."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import math
import time

import discord
from discord import app_commands
import lavalink
from aiohttp import ClientSession, web
from lavalink.events import TrackStartEvent

from src.configs.schema import StatusAPIConfig
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
        self._push_endpoint = config.push_endpoint
        self._push_token = config.push_token or config.api_key
        self._push_interval = max(10, int(getattr(config, "push_interval_seconds", 30)))
        self._event_endpoint = config.event_endpoint
        self._event_token = config.event_token or config.api_key
        self._push_task: Optional[asyncio.Task] = None
        self._event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._event_worker: Optional[asyncio.Task] = None
        self._http_session: Optional[ClientSession] = None
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

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host=self.config.host, port=self.config.port)
        await self._site.start()
        self.logger.info("Status API listening on %s:%s", self.config.host, self.config.port)
        if self._push_endpoint or self._event_endpoint:
            self._http_session = ClientSession()
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
        if self._http_session:
            await self._http_session.close()
            self._http_session = None
        if self._site:
            await self._site.stop()
            self._site = None
        if self._runner:
            await self._runner.cleanup()
            self._runner = None
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
        if self.config.api_key:
            auth_header = request.headers.get("Authorization")
            if auth_header != f"Bearer {self.config.api_key}":
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
            ttl = max(1, int(self.config.cache_ttl_seconds or 5))
            self._cache = {
                "payload": payload,
                "expires": current + ttl,
            }
            return payload

    # ------------------------------------------------------------------ helpers
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
        latency_ms = round(self._safe_float(self.bot.latency, 0.0) * 1000, 2)
        shards, shards_online, shards_total = self._build_shard_snapshot()
        commands, categories = self._command_reference()
        uptime_seconds = round(HealthState.uptime(), 2)
        uptime_percent = 100 if uptime_seconds > 0 else 0
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
            "latency": latency_ms,
            "averageLatency": latency_ms,
            "latencyMs": latency_ms,
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
            self.record_incident(reason="command_error", timestamp=now)

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

    def record_incident(self, *, reason: Optional[str] = None, timestamp: Optional[float] = None) -> None:
        if not self.enabled:
            return
        now = timestamp or time.time()
        self._incident_events.append(now)
        self._incidents_total += 1
        self._prune_events(now)
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
        if self.config.api_key:
            auth_header = request.headers.get("Authorization")
            if auth_header != f"Bearer {self.config.api_key}":
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
        if self.config.api_key:
            auth_header = request.headers.get("Authorization")
            if auth_header != f"Bearer {self.config.api_key}":
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

        return web.json_response({"ok": True})

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

    def _build_shard_snapshot(self) -> Tuple[List[Dict[str, Any]], int, int]:
        latencies: List[Tuple[int, Optional[float]]] = getattr(self.bot, "latencies", [])
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
