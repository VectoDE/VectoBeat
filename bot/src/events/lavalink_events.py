"""Lavalink node lifecycle observers with basic failover handling."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import List

import lavalink
from discord.ext import commands
from lavalink.events import NodeDisconnectedEvent, NodeReadyEvent

logger = logging.getLogger(__name__)


class LavalinkNodeEvents(commands.Cog):
    """React to Lavalink node events to keep playback resilient."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        if hasattr(bot, "lavalink"):
            bot.lavalink.add_event_hooks(self)

    # ------------------------------------------------------------------ helpers
    def _available_nodes(self, *, exclude=None) -> List:
        client = getattr(self.bot, "lavalink", None)
        if not client:
            return []
        nodes = [
            node
            for node in client.node_manager.nodes
            if node.available and node is not exclude
        ]
        nodes.sort(key=self._node_load)
        return nodes

    @staticmethod
    def _node_load(node) -> float:
        stats = getattr(node, "stats", None)
        if not stats:
            return 0.0
        playing = getattr(stats, "playing_players", None)
        if playing is not None:
            return float(playing)
        players = getattr(stats, "players", 0)
        return float(players)

    async def _migrate_players(self, failed_node) -> None:
        client = getattr(self.bot, "lavalink", None)
        if not client:
            return

        node_manager = getattr(client, "node_manager", None)
        all_nodes = getattr(node_manager, "nodes", []) if node_manager else []

        players = [
            player
            for player in client.player_manager.players.values()
            if getattr(player, "node", None) is failed_node
        ]
        if not players:
            return

        candidates = self._available_nodes(exclude=failed_node)
        if not candidates:
            log_fn = logger.warning if len(all_nodes) > 1 else logger.info
            log_fn(
                "Unable to migrate %s player(s); no healthy Lavalink nodes available.",
                len(players),
            )
            return

        target = candidates[0]
        for player in players:
            changer = getattr(player, "change_node", None)
            if not changer:
                continue
            try:
                result = changer(target)
                if inspect.isawaitable(result):
                    await result
                if player.is_connected and player.current and not player.is_playing:
                    await player.play()
                logger.info("Migrated player %s to node '%s'.", player.guild_id, target.name)
            except Exception as exc:  # pragma: no cover - network and lavalink behaviour
                logger.error("Failed to migrate player %s: %s", player.guild_id, exc)

    # ------------------------------------------------------------------ listeners
    @lavalink.listener()
    async def on_node_ready(self, event: NodeReadyEvent):
        node = getattr(event, "node", None)
        if not node:
            logger.debug(
                "Ignoring %s without node payload.",
                event.__class__.__name__,
            )
            return
        logger.info(
            "Lavalink node '%s' ready with %s player(s).",
            node.name,
            getattr(getattr(node, "stats", None), "players", 0),
        )
        routing = getattr(self.bot, "regional_routing", None)
        if routing:
            asyncio.create_task(routing.reconcile_all())

    @lavalink.listener()
    async def on_node_disconnected(self, event: NodeDisconnectedEvent):
        node = getattr(event, "node", None)
        if not node:
            logger.debug(
                "Ignoring %s without node payload.",
                event.__class__.__name__,
            )
            return
        client = getattr(self.bot, "lavalink", None)
        attached_players = 0
        if client:
            attached_players = sum(
                1
                for player in client.player_manager.players.values()
                if getattr(player, "node", None) is node
            )

        log_fn = logger.warning if attached_players else logger.info
        log_fn(
            "Lavalink node '%s' disconnected; attempting failover (players affected: %s).",
            node.name,
            attached_players,
        )
        asyncio.create_task(self._migrate_players(node))
        manager = getattr(self.bot, "lavalink_manager", None)
        if manager:
            asyncio.create_task(manager.ensure_ready())
        routing = getattr(self.bot, "regional_routing", None)
        if routing:
            asyncio.create_task(routing.reconcile_all())


async def setup(bot: commands.Bot):
    await bot.add_cog(LavalinkNodeEvents(bot))
