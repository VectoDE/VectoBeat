"""Abstractions for managing Lavalink connectivity and Discord voice sessions."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Sequence
from typing import Any

from aiohttp import ClientConnectorError, ClientResponseError, ContentTypeError
import discord
import lavalink
from lavalink.errors import AuthenticationError

from src.configs.schema import LavalinkConfig


class VectoPlayer(lavalink.DefaultPlayer):
    """Custom Lavalink player that stores guild metadata."""

    __slots__ = ("text_channel_id",)

    def __init__(self, guild_id: int, client: lavalink.Client) -> None:
        super().__init__(guild_id, client)
        self.text_channel_id: int | None = None


class LavalinkVoiceClient(discord.VoiceProtocol):
    """Voice protocol bridging discord.py voice state with Lavalink."""

    def __init__(self, client: discord.Client, channel: discord.abc.Connectable) -> None:
        self.client = client
        self.channel = channel
        self.guild_id = channel.guild.id
        self._destroyed = False
        self.logger = logging.getLogger("VectoBeat.LavalinkVoice")

        if not hasattr(self.client, "lavalink"):
            raise RuntimeError("Lavalink client has not been initialised.")

        self.lavalink: lavalink.Client[VectoPlayer] = self.client.lavalink

    async def connect(
        self,
        *,
        timeout: float,
        reconnect: bool,
        self_deaf: bool = False,
        self_mute: bool = False,
    ) -> None:
        """Create or reuse a player and join the voice channel."""
        self.lavalink.player_manager.create(self.guild_id)
        await self.channel.guild.change_voice_state(
            channel=self.channel, self_deaf=self_deaf, self_mute=self_mute
        )

    async def on_voice_server_update(self, data: dict[str, Any]) -> None:
        payload = {
            "t": "VOICE_SERVER_UPDATE",
            "d": data,
        }
        await self.lavalink.voice_update_handler(payload)

    async def on_voice_state_update(self, data: dict[str, Any]) -> None:
        channel_id = data.get("channel_id")

        if not channel_id:
            await self._destroy()
            return

        self.channel = self.client.get_channel(int(channel_id))  # type: ignore[assignment]

        payload = {
            "t": "VOICE_STATE_UPDATE",
            "d": data,
        }
        await self.lavalink.voice_update_handler(payload)

    async def disconnect(self, *, force: bool = False) -> None:
        player = self.lavalink.player_manager.get(self.guild_id)

        if not force and not player.is_connected:
            return

        await self.channel.guild.change_voice_state(channel=None)
        player.channel_id = None
        await self._destroy()

    async def _destroy(self) -> None:
        self.cleanup()

        if self._destroyed:
            return

        self._destroyed = True
        try:
            await self.lavalink.player_manager.destroy(self.guild_id)
        except lavalink.ClientError:
            pass
        except ContentTypeError as exc:
            self.logger.warning(
                "Ignoring Lavalink response while destroying player %s: %s",
                self.guild_id,
                exc,
            )


class LavalinkManager:
    """Initialises and tears down Lavalink resources for the bot."""

    def __init__(self, bot: discord.Client, nodes: Sequence[LavalinkConfig]) -> None:
        self.bot = bot
        self.nodes: list[LavalinkConfig] = list(nodes)
        if not self.nodes:
            raise RuntimeError("At least one Lavalink node must be configured.")
        self.logger = logging.getLogger("VectoBeat.Lavalink")
        self._node_handles: dict[str, lavalink.Node] = {}
        self._nodes_by_region: dict[str, list[str]] = defaultdict(list)
        self._node_priority = {cfg.name: idx for idx, cfg in enumerate(self.nodes)}

    async def connect(self) -> None:
        if not hasattr(self.bot, "lavalink"):
            self.bot.lavalink = lavalink.Client(
                self.bot.user.id, player=VectoPlayer  # type: ignore[arg-type]
            )

        client: lavalink.Client[VectoPlayer] = self.bot.lavalink
        tasks = [self._register_node(client, config) for config in self.nodes]
        await asyncio.gather(*tasks)

    async def _register_node(self, client: lavalink.Client[VectoPlayer], config: LavalinkConfig) -> lavalink.Node:
        existing = next((node for node in client.node_manager.nodes if node.name == config.name), None)
        if existing:
            self.logger.info("Lavalink node '%s' already registered.", existing.name)
            self._index_node(config, existing)
            return existing

        node = client.add_node(
            host=config.host,
            port=config.port,
            password=config.password,
            region=config.region,
            name=config.name,
            ssl=config.https,
            connect=False,
        )

        try:
            await node.connect(force=True)
            await asyncio.wait_for(node.get_version(), timeout=5)
        except AuthenticationError:
            self.logger.error(
                "Lavalink authentication failed for node '%s'. "
                "Verify the password in config.yml/.env matches the server configuration.",
                config.name,
            )
        except ClientConnectorError as exc:
            self.logger.error(
                "Could not reach Lavalink node '%s' at %s:%s (%s). Please ensure the server is running "
                "and accessible from this host.",
                config.name,
                config.host,
                config.port,
                exc.strerror or exc,
            )
        except asyncio.TimeoutError:
            self.logger.warning(
                "Timed out while verifying Lavalink node '%s'. Continuing but playback may fail.",
                config.name,
            )
        else:
            self.logger.info(
                "Authenticated Lavalink node %s (%s:%s, ssl=%s)",
                config.name,
                config.host,
                config.port,
                config.https,
            )
        self._index_node(config, node)
        return node

    def _index_node(self, config: LavalinkConfig, node: lavalink.Node) -> None:
        name = node.name
        self._node_handles[name] = node
        region = (config.region or "auto").lower()
        bucket = self._nodes_by_region.setdefault(region, [])
        if name not in bucket:
            bucket.append(name)
        auto_bucket = self._nodes_by_region.setdefault("auto", [])
        if name not in auto_bucket:
            auto_bucket.append(name)

    async def ensure_ready(self) -> None:
        """Ensure all configured nodes are connected and available."""
        client: lavalink.Client | None = getattr(self.bot, "lavalink", None)
        if not client:
            return

        reconnect_tasks = []
        for node in client.node_manager.nodes:
            if not node.available:
                reconnect_tasks.append(node.connect(force=True))

        if reconnect_tasks:
            await asyncio.gather(*reconnect_tasks, return_exceptions=True)

    async def close(self) -> None:
        if hasattr(self.bot, "lavalink"):
            try:
                await self.bot.lavalink.close()
            except Exception as exc:  # pragma: no cover - defensive
                self.logger.error("Error closing Lavalink: %s", exc)

    async def route_player(self, player: VectoPlayer, region: str) -> None:
        cooldown_until = player.fetch("migration_cooldown_until")
        now = asyncio.get_running_loop().time()
        if isinstance(cooldown_until, (int, float)) and cooldown_until > now:
            remaining = cooldown_until - now
            self.logger.debug(
                "Skipping routing for guild %s; migration cooldown active for %.1fs.",
                player.guild_id,
                remaining,
            )
            return
        target = self._pick_node(region)
        if not target:
            return
        current = getattr(player.node, "name", None)
        if current == target.name:
            return
        try:
            await player.change_node(target)
            self.logger.debug(
                "Moved guild %s to Lavalink node %s (requested region=%s).",
                player.guild_id,
                target.name,
                region,
            )
            player.store("migration_cooldown_until", None)
        except (ClientResponseError, ContentTypeError) as exc:
            status = getattr(exc, "status", None)
            if status == 429 or isinstance(exc, ContentTypeError):
                retry_in = 30.0
                player.store("migration_cooldown_until", now + retry_in)
                self.logger.warning(
                    "Rate limited moving guild %s to node %s (status=%s); backing off for %.0fs.",
                    player.guild_id,
                    target.name,
                    status or "n/a",
                    retry_in,
                )
                return
            self.logger.warning(
                "Failed to move guild %s to node %s: %s", player.guild_id, target.name, exc
            )
        except Exception as exc:
            self.logger.warning(
                "Failed to move guild %s to node %s: %s", player.guild_id, target.name, exc
            )

    def _pick_node(self, region: str) -> lavalink.Node | None:
        region_key = (region or "auto").lower()
        order: list[str] = []
        if region_key != "auto":
            order.extend(self._nodes_by_region.get(region_key, []))
        order.extend(self._nodes_by_region.get("auto", []))
        for name in order:
            handle = self._node_handles.get(name)
            if handle and handle.available:
                return handle
        return None

    def priority(self, node_name: str) -> int:
        """Return the configured priority (lower is preferred)."""
        return self._node_priority.get(node_name, len(self._node_priority))
