"""Lifecycle hooks for updating presence and handling readiness."""

import discord
from discord.ext import commands, tasks


class LifecycleEvents(commands.Cog):
    """Handles ready events and rotating presence updates."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._status_templates = [
            "🎵 /play | Shard {shard}/{total}",
            "📡 {latency} ms ping",
            "🏠 Serving {guilds} guilds",
        ]
        self._status_index = 0
        self.rotate_status.start()

    def cog_unload(self):
        """Cancel the rotating status loop when the cog unloads."""
        self.rotate_status.cancel()

    @commands.Cog.listener()
    async def on_ready(self):
        """Initialise the first presence message once the bot is ready."""
        if not self._status_templates:
            return
        template = self._status_templates[self._status_index % len(self._status_templates)]
        await self._set_presence_for_all(template)

    @tasks.loop(seconds=45)
    async def rotate_status(self):
        """Cycle through predefined presence messages for every shard."""
        if not self._status_templates:
            return
        template = self._status_templates[self._status_index % len(self._status_templates)]
        self._status_index = (self._status_index + 1) % len(self._status_templates)
        await self._set_presence_for_all(template)

    @rotate_status.before_loop
    async def before_rotate_status(self):
        """Ensure the bot is ready before modifying presence."""
        await self.bot.wait_until_ready()

    async def _set_presence_for_all(self, template: str):
        """Set presence for all shards using a formatted template."""
        total_shards = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
        total_guilds = len(self.bot.guilds)
        latency_lookup = {sid: int(lat * 1000) for sid, lat in getattr(self.bot, "latencies", [])}

        for shard_id in range(total_shards):
            shard_guilds = sum(1 for guild in self.bot.guilds if guild.shard_id == shard_id)
            latency_ms = latency_lookup.get(shard_id, int(self.bot.latency * 1000))
            message = template.format(
                shard=shard_id + 1,
                total=total_shards,
                guilds=total_guilds,
                shard_guilds=shard_guilds,
                latency=latency_ms,
            )
            activity = discord.Activity(type=discord.ActivityType.listening, name=message)
            await self.bot.change_presence(
                status=discord.Status.online,
                activity=activity,
                shard_id=shard_id,
            )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(LifecycleEvents(bot))
