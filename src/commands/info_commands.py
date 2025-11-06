"""Diagnostic slash commands used to monitor the bot at runtime."""

from __future__ import annotations

import asyncio
import datetime
import os
import platform
import statistics
from collections import Counter
from typing import Optional, Tuple

import discord
from discord import app_commands
from discord.ext import commands

from src.services.health_service import HealthState
from src.utils.embeds import EmbedFactory

try:  # Optional dependency for richer process metrics
    import psutil  # type: ignore
except ImportError:  # pragma: no cover - psutil not installed
    psutil = None


class InfoCommands(commands.Cog):
    """Diagnostic commands for VectoBeat."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._status_lock = asyncio.Lock()

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _format_duration(seconds: float) -> str:
        """Convert seconds into a human friendly ``Xd Xh Xm Xs`` string."""
        seconds = int(seconds)
        days, rem = divmod(seconds, 86400)
        hours, rem = divmod(rem, 3600)
        minutes, secs = divmod(rem, 60)
        fragments = []
        if days:
            fragments.append(f"{days}d")
        if days or hours:
            fragments.append(f"{hours}h")
        fragments.append(f"{minutes}m")
        fragments.append(f"{secs}s")
        return " ".join(fragments)

    @staticmethod
    def _format_number(value: int) -> str:
        """Return a formatted integer with thin-space group separators."""
        return f"{value:,}".replace(",", "\u2009")  # thin space separators

    def _process_metrics(self) -> Tuple[Optional[float], Optional[float]]:
        """Return a tuple of (cpu_percent, memory_mb)."""
        if psutil:
            proc = psutil.Process(os.getpid())
            with proc.oneshot():
                cpu_percent = proc.cpu_percent(interval=0.0)
                mem_mb = proc.memory_full_info().uss / (1024**2)
            return cpu_percent, mem_mb
        try:  # pragma: no cover - platform specific fallback
            import resource  # type: ignore

            usage = resource.getrusage(resource.RUSAGE_SELF)
            mem_mb = usage.ru_maxrss / 1024
            return None, mem_mb
        except Exception:
            return None, None

    def _lavalink_metrics(self) -> Tuple[int, int, int]:
        """Return Lavalink metrics (players, active players, queued tracks)."""
        lavalink = getattr(self.bot, "lavalink", None)
        if not lavalink:
            return 0, 0, 0
        players = list(lavalink.player_manager.players.values())
        total_players = len(players)
        active_players = sum(1 for p in players if p.is_playing)
        queued_tracks = sum(len(getattr(p, "queue", [])) for p in players)
        return total_players, active_players, queued_tracks

    def _lavalink_nodes(self):
        """Return a list of node statistics dictionaries."""
        lavalink = getattr(self.bot, "lavalink", None)
        if not lavalink:
            return []
        nodes = []
        for node in lavalink.node_manager.nodes:
            stats = node.stats
            nodes.append(
                {
                    "name": node.name,
                    "region": node.region,
                    "players": getattr(stats, "players", 0),
                    "playing": getattr(stats, "playing_players", 0),
                    "cpu_system": getattr(getattr(stats, "cpu", None), "system_load", None),
                    "cpu_lavalink": getattr(getattr(stats, "cpu", None), "lavalink_load", None),
                    "memory_used": getattr(getattr(stats, "memory", None), "used", None),
                    "memory_allocated": getattr(getattr(stats, "memory", None), "allocated", None),
                    "frames": getattr(getattr(stats, "frame_stats", None), "sent", None),
                    "deficit": getattr(getattr(stats, "frame_stats", None), "deficit", None),
                    "nulled": getattr(getattr(stats, "frame_stats", None), "nulled", None),
                }
            )
        return nodes

    @staticmethod
    def _format_bytes(num: Optional[int]) -> str:
        """Format a byte value into a human readable string."""
        if num is None:
            return "n/a"
        step_unit = 1024
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if num < step_unit:
                return f"{num:.1f} {unit}"
            num /= step_unit
        return f"{num:.1f} PB"

    @staticmethod
    def _format_datetime(dt: Optional[datetime.datetime]) -> str:
        """Format a datetime value using Discord relative timestamps."""
        if not dt:
            return "n/a"
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return f"{discord.utils.format_dt(dt, style='F')} ({discord.utils.format_dt(dt, style='R')})"

    @staticmethod
    def _bool_icon(value: bool) -> str:
        """Return a checkmark or cross emoji for boolean values."""
        return "✅" if value else "❌"

    # ------------------------------------------------------------------ commands
    @app_commands.command(name="ping", description="Quick latency & uptime snapshot for VectoBeat.")
    async def ping(self, inter: discord.Interaction):
        """Provide a quick glance at latency, uptime and shard information."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        uptime_seconds = int(HealthState.uptime())
        embed = factory.primary("🏓 VectoBeat Ping")

        latency_ms = round(self.bot.latency * 1000, 2)
        embed.add_field(name="WebSocket Latency", value=f"`{latency_ms:.2f} ms`", inline=True)
        embed.add_field(name="Uptime", value=f"`{self._format_duration(uptime_seconds)}`", inline=True)

        shard_total = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
        shard_id = inter.guild.shard_id + 1 if inter.guild else "N/A"
        embed.add_field(name="Shard", value=f"`{shard_id}/{shard_total}`", inline=True)

        await inter.response.send_message(embed=embed)

    @app_commands.command(name="status", description="Show detailed diagnostics for VectoBeat.")
    async def status(self, inter: discord.Interaction):
        """Provide deep diagnostics including latencies, guild footprint and process metrics."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)

        async with self._status_lock:
            uptime_seconds = HealthState.uptime()
            shard_total = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
            shard_latencies = [(sid, round(lat * 1000, 2)) for sid, lat in getattr(self.bot, "latencies", [])]
            latency_values = [lat for _, lat in shard_latencies] or [round(self.bot.latency * 1000, 2)]
            avg_latency = statistics.mean(latency_values)
            sorted_latencies = sorted(latency_values)
            p95_index = max(0, int(0.95 * (len(sorted_latencies) - 1)))
            p95_latency = sorted_latencies[p95_index]

            guild_count = len(self.bot.guilds)
            text_channels = sum(len(g.text_channels) for g in self.bot.guilds)
            voice_channels = sum(len(g.voice_channels) for g in self.bot.guilds)
            member_count = sum(g.member_count or 0 for g in self.bot.guilds)

            players, active_players, queued_tracks = self._lavalink_metrics()
            voice_connections = len(self.bot.voice_clients)

            cpu_percent, memory_mb = self._process_metrics()

            embed = factory.primary("📊 VectoBeat Diagnostics")
            embed.description = "Comprehensive runtime metrics for monitoring and support."

            shard_lines = [f"`#{sid}` {lat} ms" for sid, lat in shard_latencies] or ["`#1` n/a"]
            embed.add_field(
                name="Latency",
                value=f"`avg {avg_latency:.1f} ms • p95 {p95_latency:.1f} ms`\n" + "\n".join(shard_lines),
                inline=False,
            )

            embed.add_field(
                name="Uptime",
                value=f"`{self._format_duration(uptime_seconds)}`",
                inline=True,
            )
            embed.add_field(
                name="Voice Connections",
                value=f"`{voice_connections}` active",
                inline=True,
            )
            embed.add_field(
                name="Shard Allocation",
                value=f"`{shard_total}` shard(s) • current `{inter.guild.shard_id + 1 if inter.guild else 'N/A'}`",
                inline=True,
            )

            embed.add_field(
                name="Guild Footprint",
                value=(
                    f"`{self._format_number(guild_count)}` guilds\n"
                    f"`{self._format_number(member_count)}` members\n"
                    f"`{self._format_number(text_channels)}` text / `{self._format_number(voice_channels)}` voice channels"
                ),
                inline=False,
            )

            embed.add_field(
                name="Lavalink",
                value=(
                    f"`{players}` players ({active_players} active)\n"
                    f"`{queued_tracks}` queued tracks"
                ),
                inline=True,
            )

            runtime_info = (
                f"Python `{platform.python_version()}`\n"
                f"discord.py `{discord.__version__}`\n"
                f"Host `{platform.system()} {platform.release()}`"
            )
            embed.add_field(name="Runtime", value=runtime_info, inline=True)

            process_lines = []
            if cpu_percent is not None:
                process_lines.append(f"CPU `{cpu_percent:.1f}%`")
            if memory_mb is not None:
                process_lines.append(f"RAM `{memory_mb:.1f} MB`")
            if process_lines:
                embed.add_field(name="Process", value="\n".join(process_lines), inline=True)

        await inter.response.send_message(embed=embed)

    @app_commands.command(name="uptime", description="Show bot uptime with start timestamp.")
    async def uptime(self, inter: discord.Interaction):
        """Display bot uptime along with the start timestamp."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        uptime_seconds = HealthState.uptime()
        started_at = datetime.datetime.fromtimestamp(
            HealthState.started_at, tz=datetime.timezone.utc
        )
        embed = factory.primary("⏱️ Uptime")
        embed.add_field(name="Uptime", value=f"`{self._format_duration(uptime_seconds)}`", inline=False)
        embed.add_field(name="Started", value=self._format_datetime(started_at), inline=False)
        if factory.theme.thumbnail_url:
            embed.set_thumbnail(url=factory.theme.thumbnail_url)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="botinfo", description="Comprehensive information about the running bot.")
    async def botinfo(self, inter: discord.Interaction):
        """Present application metadata, reach and runtime environment information."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        app_info = await self.bot.application_info()
        owner_names = ", ".join(owner.name for owner in ([app_info.owner] if app_info.owner else []))
        guild_count = len(self.bot.guilds)
        total_members = sum(g.member_count or 0 for g in self.bot.guilds)
        unique_users = len({member.id for g in self.bot.guilds for member in g.members}) if inter.guild else total_members
        cpu_percent, memory_mb = self._process_metrics()

        embed = factory.primary("🤖 Bot Information")
        embed.add_field(name="Application", value=f"`{app_info.name}`", inline=True)
        if owner_names:
            embed.add_field(name="Owner", value=owner_names, inline=True)
        embed.add_field(name="Command Count", value=f"`{len(self.bot.tree.get_commands())}`", inline=True)
        embed.add_field(
            name="Reach",
            value=(
                f"`{self._format_number(guild_count)}` guilds\n"
                f"`{self._format_number(unique_users)}` unique users"
            ),
            inline=False,
        )
        embed.add_field(
            name="Runtime",
            value=(
                f"Python `{platform.python_version()}`\n"
                f"discord.py `{discord.__version__}`\n"
                f"Host `{platform.system()} {platform.release()}`"
            ),
            inline=True,
        )
        if cpu_percent is not None or memory_mb is not None:
            process_lines = []
            if cpu_percent is not None:
                process_lines.append(f"CPU `{cpu_percent:.1f}%`")
            if memory_mb is not None:
                process_lines.append(f"RAM `{memory_mb:.1f} MB`")
            embed.add_field(name="Process", value="\n".join(process_lines), inline=True)

        if factory.theme.thumbnail_url:
            embed.set_thumbnail(url=factory.theme.thumbnail_url)
        await inter.response.send_message(embed=embed)

    @app_commands.command(name="guildinfo", description="Detailed information about this guild.")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def guildinfo(self, inter: discord.Interaction):
        """Show information about the guild the command is run in."""
        if not inter.guild:
            return await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)

        guild = inter.guild
        factory = EmbedFactory(guild.id)
        embed = factory.primary(f"🏠 Guild Information — {guild.name}")
        embed.description = self._format_datetime(guild.created_at)

        owner = guild.owner or await self.bot.fetch_user(guild.owner_id)
        embed.add_field(name="Owner", value=f"{owner} (`{owner.id}`)", inline=True)
        embed.add_field(name="Members", value=f"`{guild.member_count}`", inline=True)

        humans = sum(not member.bot for member in guild.members)
        bots = guild.member_count - humans if guild.member_count else 0
        embed.add_field(name="Humans / Bots", value=f"`{humans}` / `{bots}`", inline=True)

        embed.add_field(
            name="Channels",
            value=(
                f"Text `{len(guild.text_channels)}`\n"
                f"Voice `{len(guild.voice_channels)}`\n"
                f"Stage `{len(guild.stage_channels)}`"
            ),
            inline=True,
        )
        embed.add_field(
            name="Roles",
            value=f"`{len(guild.roles)}` total\nHighest: {guild.roles[-1].mention}",
            inline=True,
        )

        features = ", ".join(sorted(guild.features)) or "_None_"
        embed.add_field(name="Features", value=features, inline=False)

        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        await inter.response.send_message(embed=embed)

    @app_commands.command(name="lavalink", description="Inspect Lavalink node performance.")
    async def lavalink(self, inter: discord.Interaction):
        """Display per-node Lavalink metrics such as CPU and memory usage."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        nodes = self._lavalink_nodes()
        if not nodes:
            return await inter.response.send_message(embed=factory.warning("Lavalink is not connected."), ephemeral=True)

        embed = factory.primary("🎛️ Lavalink Nodes")
        for node in nodes:
            lines = [
                f"Region `{node['region']}`",
                f"Players `{node['playing']}/{node['players']}`",
                f"CPU `{(node['cpu_lavalink'] or 0)*100:.1f}%` LL / `{(node['cpu_system'] or 0)*100:.1f}%` SYS",
                f"Memory `{self._format_bytes(node['memory_used'])}` / `{self._format_bytes(node['memory_allocated'])}`",
            ]
            if node["frames"] is not None:
                lines.append(
                    f"Frames sent `{node['frames']}`, deficit `{node['deficit']}`, nulled `{node['nulled']}`"
                )
            embed.add_field(name=node["name"], value="\n".join(lines), inline=False)

        await inter.response.send_message(embed=embed)

    @app_commands.command(name="permissions", description="Show the bot's permissions in this channel.")
    async def permissions(self, inter: discord.Interaction):
        """Display the bot's effective permissions for the current channel."""
        if not inter.guild or not inter.channel:
            return await inter.response.send_message("This command must be invoked inside a guild channel.", ephemeral=True)

        guild = inter.guild
        me = guild.me or guild.get_member(self.bot.user.id)  # type: ignore
        if not me:
            return await inter.response.send_message("Unable to identify myself in this guild.", ephemeral=True)

        perms = inter.channel.permissions_for(me)
        factory = EmbedFactory(guild.id)
        embed = factory.primary(f"🔐 Permissions — {inter.channel.name}")

        important = {
            "connect": "Connect",
            "speak": "Speak",
            "view_channel": "View Channel",
            "send_messages": "Send Messages",
            "embed_links": "Embed Links",
            "attach_files": "Attach Files",
            "manage_messages": "Manage Messages",
            "use_voice_activation": "Use Voice Activity",
        }
        lines = [f"{self._bool_icon(getattr(perms, attr, False))} {label}" for attr, label in important.items()]
        embed.add_field(name="Key Permissions", value="\n".join(lines), inline=False)

        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(InfoCommands(bot))
