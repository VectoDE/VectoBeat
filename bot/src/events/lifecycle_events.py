"""Lifecycle hooks for updating presence and handling readiness."""

import asyncio
import discord
from discord.ext import commands, tasks
import logging

log = logging.getLogger(__name__)


class LifecycleEvents(commands.Cog):
    """Handles ready events and safe rotating presence updates."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._status_templates = [
            "🎵 /play | Shard {shard}/{total}",
            "📡 {latency} ms ping",
            "🏠 Serving {guilds} guilds",
            "❔ Need help? /help",
            "👥 Serving {users} users",
        ]
        self._status_index = 0
        self._ready = asyncio.Event()

    def cog_unload(self) -> None:
        self.rotate_status.cancel()

    # -------------------- EVENTS --------------------

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        log.info("Bot ready – initializing presence system.")
        self._ready.set()

        if not self.rotate_status.is_running():
            self.rotate_status.start()

        await self._safe_presence_update(initial=True)

    @commands.Cog.listener()
    async def on_resumed(self) -> None:
        log.warning("Connection resumed – refreshing presence.")
        await self._safe_presence_update(initial=True)

    @commands.Cog.listener()
    async def on_shard_ready(self, shard_id: int) -> None:
        log.info(f"Shard {shard_id} is ready.")

    @commands.Cog.listener()
    async def on_shard_disconnect(self, shard_id: int) -> None:
        log.warning(f"Shard {shard_id} disconnected.")

    # -------------------- LOOP --------------------

    @tasks.loop(seconds=45)
    async def rotate_status(self) -> None:
        await self._ready.wait()
        await self._safe_presence_update()

    @rotate_status.before_loop
    async def before_rotate_status(self) -> None:
        await self.bot.wait_until_ready()

    # -------------------- CORE LOGIC --------------------

    async def _safe_presence_update(self, initial: bool = False) -> None:
        try:
            template = self._status_templates[self._status_index]
            self._status_index = (self._status_index + 1) % len(self._status_templates)
            await self._set_presence_for_all(template)
        except Exception:
            log.exception("Presence update failed – retrying shortly.")
            await asyncio.sleep(5)
            # Force re-trigger ready logic
            self._ready.clear()
            await self.bot.wait_until_ready()
            self._ready.set()

    async def _set_presence_for_all(self, template: str) -> None:
        total_shards = self.bot.shard_count or 1
        total_guilds = len(self.bot.guilds)
        total_users = sum(g.member_count or 0 for g in self.bot.guilds)
        latency_lookup = self._latency_lookup()

        tasks_ = []

        for shard_id in range(total_shards):
            message = template.format(
                shard=shard_id + 1,
                total=total_shards,
                guilds=total_guilds,
                users=total_users,
                latency=latency_lookup.get(shard_id, int(self.bot.latency * 1000)),
            )

            activity = discord.Activity(
                type=discord.ActivityType.listening,
                name=message,
            )

            tasks_.append(
                self._update_shard_presence(shard_id, activity)
            )

        await asyncio.gather(*tasks_, return_exceptions=True)

    async def _update_shard_presence(self, shard_id: int, activity: discord.Activity) -> None:
        try:
            await asyncio.wait_for(
                self.bot.change_presence(
                    status=discord.Status.online,
                    activity=activity,
                    shard_id=shard_id,
                ),
                timeout=10,
            )
        except asyncio.TimeoutError:
            log.warning(f"Presence timeout on shard {shard_id}")
        except Exception:
            log.exception(f"Presence update failed on shard {shard_id}")

    # -------------------- UTIL --------------------

    def _latency_lookup(self) -> dict[int, int]:
        monitor = getattr(self.bot, "latency_monitor", None)
        if monitor:
            return {sid: int(lat) for sid, lat in monitor.snapshot().shards.items()}
        return {sid: int(lat * 1000) for sid, lat in getattr(self.bot, "latencies", [])}


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(LifecycleEvents(bot))
