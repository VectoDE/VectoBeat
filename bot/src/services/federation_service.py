import asyncio
import contextlib
import math
import socket
from typing import Any, Dict, List, Optional, TYPE_CHECKING

import aiohttp
from discord.ext import commands

from ..configs.schema import ControlPanelAPIConfig
from ..utils.logger import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

class FederationService:
    def __init__(self, bot: commands.Bot, api_config: ControlPanelAPIConfig, instance_id: Optional[str] = None, region: str = "eu-central") -> None:
        self.bot = bot
        self.api_config = api_config
        self.instance_id = instance_id or socket.gethostname()
        self.region = region
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._session: Optional["aiohttp.ClientSession"] = None
        self.peers: List[Dict[str, Any]] = []

    async def get_peers(self) -> List[Dict[str, Any]]:
        """Return list of other active bot instances."""
        return self.peers

    async def broadcast(self, event: str, payload: Dict[str, Any]) -> None:
        """Send a message to other federated instances via the control panel."""
        if not self._session or self._session.closed:
            return
        url = f"{self.api_config.base_url}/api/bot/federation/broadcast"
        try:
            await self._session.post(url, json={"event": event, "payload": payload})
        except Exception as e:
            logger.error("Broadcast failed: %s", e)

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._heartbeat_loop())
        logger.info(f"Federation service started for instance {self.instance_id}")

    async def close(self) -> None:
        await self.stop()

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _heartbeat_loop(self) -> None:
        # Frontend expects "Bearer <token>"
        headers = {"Authorization": f"Bearer {self.api_config.api_key}"}
        async with aiohttp.ClientSession(headers=headers) as session:
            self._session = session
            while self._running:
                try:
                    # 1. Send Heartbeat
                    url = f"{self.api_config.base_url}/api/bot/federation/heartbeat"
                    logger.info("Sending heartbeat to: %s", url)

                    latency = self.bot.latency
                    if latency is None or math.isnan(latency):
                        latency_ms = 0
                    else:
                        latency_ms = round(latency * 1000, 2)

                    payload = {
                        "instanceId": self.instance_id,
                        "region": self.region,
                        "status": "online",
                        "meta": {
                            "guild_count": len(self.bot.guilds),
                            "latency_ms": latency_ms,
                            "shard_count": self.bot.shard_count or 1,
                        }
                    }
                    async with session.post(url, json=payload) as resp:
                        if resp.status == 200:
                            try:
                                data = await resp.json()
                                if isinstance(data, dict):
                                    self.peers = data.get("peers", [])
                            except Exception:
                                pass
                        else:
                            logger.warning("Heartbeat failed with status %s", resp.status)

                    # 2. Poll Inbox for Broadcasts
                    inbox_url = f"{self.api_config.base_url}/api/bot/federation/inbox"
                    async with session.get(inbox_url, params={"instanceId": self.instance_id}) as resp:
                        if resp.status == 200:
                            messages = await resp.json()
                            if isinstance(messages, list):
                                for msg in messages:
                                    await self._handle_broadcast(msg)

                except Exception as e:
                    logger.error("Federation heartbeat/inbox failed: %s", e)
                
                await asyncio.sleep(30)

    async def _handle_broadcast(self, message: Dict[str, Any]) -> None:
        """Dispatch received broadcast to internal event bus."""
        event_type = message.get("event")
        payload = message.get("payload", {})
        logger.info("Received federation broadcast: %s", event_type)
        # Dispatch to bot's event loop
        self.bot.dispatch("federation_event", event_type, payload)
