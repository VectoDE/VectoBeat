"""Integration with external bot list platforms."""

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import aiohttp
import discord
from discord.ext import commands

from src.configs.schema import BotListConfig

if TYPE_CHECKING:
    from src.main import VectoBeat


class BotListService:
    """Handles synchronisation with external bot list APIs."""

    BASE_URL = "https://discordbotlist.com/api/v1"

    def __init__(self, bot: "VectoBeat", config: BotListConfig) -> None:
        self.bot = bot
        self.config = config
        self.logger = logging.getLogger("VectoBeat.BotList")
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self) -> None:
        """Initialise the session. Intentionally minimal."""
        if not self.config.discord_bot_list_token:
            self.logger.debug("DiscordBotList token missing; sync disabled.")
            return
        self._session = aiohttp.ClientSession(
            headers={"Authorization": self.config.discord_bot_list_token}
        )

    async def close(self) -> None:
        """Clean up the aiohttp session."""
        if self._session:
            await self._session.close()
            self._session = None

    async def sync_commands(self) -> None:
        """Fetch application commands and push them to DiscordBotList."""
        if not self._session or not self.config.discord_bot_list_token:
            return

        if not self.bot.application_id:
            self.logger.warning("Cannot sync commands to DBL: application_id is missing.")
            return

        self.logger.info("Synchronising commands with DiscordBotList...")

        try:
            # We use the translated payloads if the bot has a translator, otherwise standard dicts.
            # This aligns with how the bot performs bulk_upsert to Discord.
            commands_list = self.bot.tree._get_all_commands()
            translator = self.bot.tree.translator
            
            payload: List[Dict[str, Any]] = []
            for cmd in commands_list:
                if translator:
                    cmd_data = await cmd.get_translated_payload(self.bot.tree, translator)
                else:
                    cmd_data = cmd.to_dict(self.bot.tree)
                
                # Strip unnecessary fields often rejected or ignored by bot lists
                cmd_data.pop("integration_types", None)
                cmd_data.pop("contexts", None)
                payload.append(cmd_data)

            url = f"{self.BASE_URL}/bots/{self.bot.application_id}/commands"
            async with self._session.post(url, json=payload) as resp:
                if resp.status == 204 or resp.status == 200:
                    self.logger.info("Successfully synced %d commands to DiscordBotList.", len(payload))
                else:
                    text = await resp.text()
                    self.logger.error(
                        "Failed to sync commands to DiscordBotList (Status %d): %s",
                        resp.status,
                        text,
                    )
        except Exception as exc:
            self.logger.error("Unexpected error during DiscordBotList command sync: %s", exc)
