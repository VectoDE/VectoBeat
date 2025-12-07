"""Prometheus metrics exporter and helper utilities."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import lavalink
from prometheus_client import CollectorRegistry, Counter, Gauge, start_http_server

from src.services.health_service import HealthState


class MetricsService:
    """Continuously export bot metrics for Prometheus scraping."""

    def __init__(self, bot, config):
        self.bot = bot
        self.config = config
        self.enabled = getattr(config, "enabled", False)
        self.logger = logging.getLogger("VectoBeat.Metrics")
        self.registry = CollectorRegistry()
        self._task: Optional[asyncio.Task] = None
        self._started = False

        self.uptime_gauge = Gauge("vectobeat_uptime_seconds", "Bot uptime in seconds", registry=self.registry)
        self.guilds_gauge = Gauge("vectobeat_guilds", "Current guild count", registry=self.registry)
        self.players_gauge = Gauge("vectobeat_lavalink_players", "Number of Lavalink players", registry=self.registry)
        self.active_players_gauge = Gauge(
            "vectobeat_lavalink_active_players", "Number of actively playing Lavalink players", registry=self.registry
        )
        self.queue_tracks_gauge = Gauge(
            "vectobeat_queue_tracks", "Number of queued tracks across players", registry=self.registry
        )
        self.node_up_gauge = Gauge(
            "vectobeat_lavalink_node_up",
            "Lavalink node availability",
            labelnames=("node",),
            registry=self.registry,
        )
        self.shard_latency_gauge = Gauge(
            "vectobeat_shard_latency_seconds",
            "Shard gateway latency",
            labelnames=("shard",),
            registry=self.registry,
        )
        self.command_counter = Counter(
            "vectobeat_commands_total",
            "Slash command invocation counts",
            labelnames=("command", "status"),
            registry=self.registry,
        )

    async def start(self) -> None:
        if not self.enabled or self._started:
            return
        start_http_server(addr=self.config.host, port=self.config.port, registry=self.registry)
        interval = max(5, int(getattr(self.config, "collection_interval", 15)))
        self._task = asyncio.create_task(self._loop(interval))
        self._started = True
        self.logger.info(
            "Prometheus exporter listening on %s:%s (interval=%ss)", self.config.host, self.config.port, interval
        )

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _loop(self, interval: int) -> None:
        try:
            while True:
                await self._collect()
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass

    async def _collect(self) -> None:
        self.uptime_gauge.set(HealthState.uptime())
        self.guilds_gauge.set(len(getattr(self.bot, "guilds", [])))

        lavalink_client: Optional[lavalink.Client] = getattr(self.bot, "lavalink", None)
        if lavalink_client:
            players = list(lavalink_client.player_manager.players.values())
            self.players_gauge.set(len(players))
            active = sum(1 for p in players if p.is_playing)
            queued = sum(len(getattr(p, "queue", [])) for p in players)
            self.active_players_gauge.set(active)
            self.queue_tracks_gauge.set(queued)
            for node in lavalink_client.node_manager.nodes:
                self.node_up_gauge.labels(node=node.name).set(1 if node.available else 0)
        else:
            self.players_gauge.set(0)
            self.active_players_gauge.set(0)
            self.queue_tracks_gauge.set(0)

        monitor = getattr(self.bot, "latency_monitor", None)
        if monitor:
            snapshot = monitor.snapshot()
        else:
            snapshot = None

        if snapshot and snapshot.shards:
            for shard_id, latency_ms in snapshot.shards.items():
                self.shard_latency_gauge.labels(shard=str(shard_id)).set(latency_ms / 1000)
        elif hasattr(self.bot, "shards") and self.bot.shards:
            for shard_id, shard in self.bot.shards.items():
                latency = getattr(shard, "latency", None) or 0.0
                self.shard_latency_gauge.labels(shard=str(shard_id)).set(latency)
        else:
            self.shard_latency_gauge.labels(shard="0").set(self.bot.latency if self.bot.latency else 0.0)

    # ------------------------------------------------------------------ public helpers
    def record_command(self, name: str, *, success: bool) -> None:
        if not self.enabled:
            return
        status = "success" if success else "error"
        self.command_counter.labels(command=name, status=status).inc()
