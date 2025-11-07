"""Abstractions for managing Lavalink connectivity and Discord voice sessions."""

import asyncio
import logging
from typing import Optional

import aiohttp
import discord
import lavalink
from lavalink.errors import AuthenticationError


class VectoPlayer(lavalink.DefaultPlayer):
    """Custom Lavalink player that stores guild metadata."""

    __slots__ = ("text_channel_id",)

    def __init__(self, guild_id: int, client: lavalink.Client):
        super().__init__(guild_id, client)
        self.text_channel_id: Optional[int] = None


class LavalinkVoiceClient(discord.VoiceProtocol):
    """Voice protocol bridging discord.py voice state with Lavalink."""

    def __init__(self, client: discord.Client, channel: discord.abc.Connectable):
        self.client = client
        self.channel = channel
        self.guild_id = channel.guild.id
        self._destroyed = False

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

    def _is_self(self, user_id) -> bool:
        me = getattr(self.client, "user", None)
        if not me or user_id is None:
            return False
        return str(user_id) == str(me.id)

    def _is_guild(self, guild_id) -> bool:
        if guild_id is None:
            return False
        try:
            return int(guild_id) == self.guild_id
        except (TypeError, ValueError):
            return False

    async def on_voice_server_update(self, data):
        if not self._is_guild(data.get("guild_id")):
            return

        payload = {
            "t": "VOICE_SERVER_UPDATE",
            "d": data,
        }
        await self.lavalink.voice_update_handler(payload)

    async def on_voice_state_update(self, data):
        if not self._is_guild(data.get("guild_id")) or not self._is_self(data.get("user_id")):
            return

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

    async def _destroy(self):
        self.cleanup()

        if self._destroyed:
            return

        self._destroyed = True
        try:
            await self.lavalink.player_manager.destroy(self.guild_id)
        except lavalink.ClientError:
            pass


class LavalinkManager:
    """Initialises and tears down Lavalink resources for the bot."""

    def __init__(self, bot: discord.Client, config):
        self.bot = bot
        self.config = config
        self.logger = logging.getLogger("VectoBeat.Lavalink")

    async def connect(self):
        if not hasattr(self.bot, "lavalink"):
            self.bot.lavalink = lavalink.Client(
                self.bot.user.id, player=VectoPlayer  # type: ignore[arg-type]
            )

        client: lavalink.Client[VectoPlayer] = self.bot.lavalink
        existing = next(
            (node for node in client.node_manager.nodes if node.name == self.config.name),
            None,
        )
        if existing:
            self.logger.info("Lavalink node '%s' already registered.", existing.name)
            return

        node = client.add_node(
            host=self.config.host,
            port=self.config.port,
            password=self.config.password,
            region=self.config.region,
            name=self.config.name,
            ssl=self.config.https,
            connect=False,
        )

        try:
            # Force an explicit connection attempt so we can surface authentication errors early.
            await node.connect(force=True)
            await asyncio.wait_for(node.get_version(), timeout=5)
        except AuthenticationError:
            self.logger.error(
                "Lavalink authentication failed for node '%s'. "
                "Verify the password in config.yml/.env matches the server configuration.",
                self.config.name,
            )
        except aiohttp.ClientConnectorError as exc:
            self.logger.error(
                "Could not reach Lavalink node '%s' at %s:%s (%s). Please ensure the server is running "
                "and accessible from this host.",
                self.config.name,
                self.config.host,
                self.config.port,
                exc.strerror or exc,
            )
        except asyncio.TimeoutError:
            self.logger.warning(
                "Timed out while verifying Lavalink node '%s'. Continuing but playback may fail.",
                self.config.name,
            )
        else:
            self.logger.info(
                "Authenticated Lavalink node %s (%s:%s, ssl=%s)",
                self.config.name,
                self.config.host,
                self.config.port,
                self.config.https,
            )

    async def ensure_ready(self):
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

    async def close(self):
        if hasattr(self.bot, "lavalink"):
            try:
                await self.bot.lavalink.close()
            except Exception as exc:  # pragma: no cover - defensive
                self.logger.error("Error closing Lavalink: %s", exc)
