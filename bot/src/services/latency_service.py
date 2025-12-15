"""Lightweight gateway latency sampler shared across commands and telemetry."""

from __future__ import annotations

import asyncio
import statistics
import time
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple

import discord


class LatencySnapshot:
    """Value object returned by :class:`LatencyMonitor.snapshot`."""

    def __init__(
        self,
        *,
        best: float,
        average: float,
        p95: float,
        shards: Dict[int, float],
        loop_lag_ms: Optional[float],
        updated_at: float,
    ):
        self.best = best
        self.average = average
        self.p95 = p95
        self.shards = shards
        self.loop_lag_ms = loop_lag_ms
        self.updated_at = updated_at


class LatencyMonitor:
    """Continuously sample shard heartbeats and provide trimmed latency stats."""

    def __init__(
        self,
        bot: discord.Client,
        *,
        sample_interval: float = 2.0,
        max_samples: int = 60,
    ):
        self.bot = bot
        self.sample_interval = sample_interval
        self._latency_samples: Deque[float] = deque(maxlen=max_samples)
        self._loop_lag_samples: Deque[float] = deque(maxlen=max_samples)
        self._latest_shards: Dict[int, float] = {}
        self._task: Optional[asyncio.Task[None]] = None
        self._last_updated: float = 0.0

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    # ------------------------------------------------------------------ internals
    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        await self.bot.wait_until_ready()
        target = loop.time() + self.sample_interval
        try:
            while True:
                await asyncio.sleep(max(0.0, target - loop.time()))
                now = loop.time()
                self._sample_latencies()
                self._sample_loop_lag(now - target)
                target = now + self.sample_interval
                self._last_updated = time.time()
        except asyncio.CancelledError:
            pass

    def _sample_latencies(self) -> None:
        raw = self._collect_latencies()
        if not raw:
            return
        for shard_id, latency_ms in raw:
            self._latest_shards[shard_id] = latency_ms
            self._latency_samples.append(latency_ms)

    def _sample_loop_lag(self, drift_seconds: float) -> None:
        lag_ms = max(drift_seconds * 1000, 0.0)
        self._loop_lag_samples.append(lag_ms)

    def _collect_latencies(self) -> List[Tuple[int, float]]:
        latencies: List[Tuple[int, float]] = []
        for shard_id, latency in getattr(self.bot, "latencies", []):
            if latency is None:
                continue
            lat_ms = max(latency * 1000, 0.0)
            latencies.append((shard_id, lat_ms))
        if latencies:
            return latencies

        fallback = getattr(self.bot, "latency", None)
        if fallback is None:
            return []
        return [(0, max(fallback * 1000, 0.0))]

    # ------------------------------------------------------------------ public API
    def snapshot(self) -> LatencySnapshot:
        values = list(self._latency_samples)
        shards = dict(self._latest_shards)

        if not values:
            # Fallback directly to current gateway latency if sampling hasn't started.
            raw = self._collect_latencies()
            values = [lat for _, lat in raw] if raw else [0.0]
            shards = {sid: lat for sid, lat in raw} if raw else {}

        sorted_vals = sorted(values)
        best = sorted_vals[0]
        avg = self._trimmed_mean(sorted_vals)
        p95_index = max(0, int(0.95 * (len(sorted_vals) - 1)))
        p95 = sorted_vals[p95_index]
        loop_lag_ms = statistics.mean(self._loop_lag_samples) if self._loop_lag_samples else None

        return LatencySnapshot(
            best=best,
            average=avg,
            p95=p95,
            shards=shards,
            loop_lag_ms=loop_lag_ms,
            updated_at=self._last_updated or time.time(),
        )

    @staticmethod
    def _trimmed_mean(values: List[float], *, trim_ratio: float = 0.2) -> float:
        """Return a trimmed mean to reduce the impact of outliers."""
        if not values:
            return 0.0
        if len(values) < 5:
            return statistics.mean(values)
        trim = max(1, int(len(values) * trim_ratio))
        trimmed = values[trim:-trim]
        return statistics.mean(trimmed or values)
