"""Lavalink node lifecycle observers with basic failover handling."""

# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import List, Optional

import lavalink
import discord
from discord.ext import commands
from lavalink.events import NodeDisconnectedEvent, NodeReadyEvent

from src.services.lavalink_service import LavalinkVoiceClient

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

    async def _ensure_voice_connected(self, player: lavalink.DefaultPlayer) -> None:
        """Reconnect to the original voice channel if Discord dropped the session."""
        guild = self.bot.get_guild(player.guild_id)
        channel_id = getattr(player, "channel_id", None)
        if not guild or not channel_id:
            return

        voice_client = guild.voice_client
        if voice_client and getattr(voice_client, "channel", None):
            connected_id = getattr(getattr(voice_client, "channel", None), "id", None)
            if connected_id == channel_id and getattr(voice_client, "is_connected", lambda: False)():
                return

        channel = guild.get_channel(channel_id)
        if isinstance(channel, discord.VoiceChannel):
            try:
                await channel.connect(cls=LavalinkVoiceClient)  # type: ignore[arg-type]
                logger.info("Rejoined voice channel %s after node failover.", channel.id)
            except Exception as exc:  # pragma: no cover - network/Discord behaviour
                logger.warning("Failed to rejoin voice channel %s: %s", channel_id, exc)

    async def _pick_target_node(
        self, failed_node, player: lavalink.DefaultPlayer, candidates: List[lavalink.Node]
    ) -> Optional[lavalink.Node]:
        """Choose the best replacement node, preferring the guild's region when available."""
        manager = getattr(self.bot, "lavalink_manager", None)
        settings = getattr(self.bot, "server_settings", None)
        desired_region = None
        if settings:
            try:
                desired_region = await settings.lavalink_region(player.guild_id)
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Failed to resolve lavalink region for guild %s: %s", player.guild_id, exc)

        if manager and desired_region:
            candidate = manager._pick_node(desired_region)  # type: ignore[attr-defined]
            if candidate and candidate.available and candidate is not failed_node:
                return candidate

        for node in candidates:
            if node is not failed_node and node.available:
                return node
        return None

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
            current_track = getattr(player, "current", None)
            current_position = int(getattr(player, "position", 0) or 0)
            was_paused = bool(getattr(player, "paused", False))
            target = await self._pick_target_node(failed_node, player, candidates)
            if not target:
                logger.warning(
                    "No available Lavalink node to migrate guild %s after failure.", player.guild_id
                )
                continue

            changer = getattr(player, "change_node", None)
            if not changer:
                continue
            try:
                result = changer(target)
                if inspect.isawaitable(result):
                    await result

                await self._ensure_voice_connected(player)

                if current_track:
                    resume_from = max(0, current_position - 1000)
                    await player.play(track=current_track, start_time=resume_from, no_replace=False)
                    if was_paused:
                        await player.set_pause(True)
                    logger.info(
                        "Migrated player %s to node '%s' and resumed track at %sms.",
                        player.guild_id,
                        target.name,
                        resume_from,
                    )
                elif player.queue:
                    await player.play()
                    logger.info(
                        "Migrated player %s to node '%s' and restarted queued playback.",
                        player.guild_id,
                        target.name,
                    )
                else:
                    logger.info("Migrated player %s to node '%s' (no active track).", player.guild_id, target.name)

                queue_sync = getattr(self.bot, "queue_sync", None)
                if queue_sync:
                    asyncio.create_task(
                        queue_sync.publish_state(
                            player.guild_id,
                            player,
                            "node_failover",
                            {"from": getattr(failed_node, "name", None), "to": target.name},
                        )
                    )
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
