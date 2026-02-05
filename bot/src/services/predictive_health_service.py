"""Predictive health monitoring and scoring service."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from discord.ext import commands
import lavalink


class PredictiveHealthService:
    """Monitors bot vitals and computes a predictive health score (0-100)."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.logger = logging.getLogger("VectoBeat.PredictiveHealth")
        self._task: asyncio.Task[None] | None = None
        self._history: list[float] = []
        self._last_score = 100.0
        self._status: str = "healthy"

    async def start(self) -> None:
        """Start the background monitoring loop."""
        if self._task:
            return
        self._task = asyncio.create_task(self._monitor_loop())
        self.logger.info("Predictive health monitoring started.")

    async def close(self) -> None:
        """Stop the monitoring loop."""
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def get_score(self) -> float:
        """Return the current health score (0-100)."""
        return self._last_score

    def get_status(self) -> dict[str, str | float | int]:
        """Return a snapshot of health metrics."""
        return {
            "score": round(self._last_score, 1),
            "status": self._status,
            "latency_ms": round(self.bot.latency * 1000, 2) if self.bot.latency else 0,
            "loop_lag_ms": round(self._history[-1] * 1000, 2) if self._history else 0,
            "sample_size": len(self._history),
        }

    async def _monitor_loop(self) -> None:
        """Periodically check system vitals."""
        try:
            while True:
                start = time.monotonic()
                await asyncio.sleep(5)
                # Calculate how much we drifted from the expected 5s sleep
                # This measures the event loop lag
                elapsed = time.monotonic() - start
                lag = max(0.0, elapsed - 5.0)

                self._history.append(lag)
                if len(self._history) > 12:  # Keep last ~1 minute (12 * 5s)
                    self._history.pop(0)

                self._last_score = self._calculate_score(lag)
                self._update_status_label()

        except Exception as exc:
            self.logger.error("Health monitor crashed: %s", exc)

    def _calculate_score(self, current_lag: float) -> float:
        """Compute score based on lag, latency, and Lavalink status."""
        score = 100.0

        # 1. Event Loop Lag Penalty
        # 0.1s lag is noticeable but okay. 0.5s is bad.
        if current_lag > 0.5:
            score -= 40
        elif current_lag > 0.1:
            score -= 10
        elif current_lag > 0.05:
            score -= 2

        # 2. Discord Gateway Latency Penalty
        latency = self.bot.latency or 0.0
        if latency > 0.5:  # > 500ms
            score -= 30
        elif latency > 0.2:  # > 200ms
            score -= 10
        elif latency > 0.1:  # > 100ms
            score -= 1

        # 3. Lavalink Node Availability
        lavalink_client: lavalink.Client | None = getattr(self.bot, "lavalink", None)
        if lavalink_client:
            total_nodes = len(lavalink_client.node_manager.nodes)
            if total_nodes > 0:
                available = sum(1 for n in lavalink_client.node_manager.nodes if n.available)
                if available == 0:
                    score -= 50  # Critical: No music possible
                elif available < total_nodes:
                    penalty = 20 * ((total_nodes - available) / total_nodes)
                    score -= penalty

        return max(0.0, min(100.0, score))

    def _update_status_label(self) -> None:
        if self._last_score >= 90:
            self._status = "healthy"
        elif self._last_score >= 70:
            self._status = "degraded"
        else:
            self._status = "critical"
