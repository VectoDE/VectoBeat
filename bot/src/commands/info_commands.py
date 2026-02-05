"""Diagnostic slash commands used to monitor the bot at runtime."""

from __future__ import annotations

import asyncio
import datetime
import os
import platform
import statistics
import time
from typing import Any, Optional, Tuple

import discord
from discord import app_commands
from discord.ext import commands

from src.services.health_service import HealthState
from src.utils.embeds import EmbedFactory
from src.configs.settings import VERSION

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

    @staticmethod
    def _process_metrics() -> Tuple[Optional[float], Optional[float]]:
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

    def _lavalink_nodes(self) -> list[dict[str, Any]]:
        """Return a list of node statistics dictionaries."""
        lavalink = getattr(self.bot, "lavalink", None)
        if not lavalink:
            return []

        def _stat(source: Any, key: str, default: Any = None) -> Any:
            if source is None:
                return default
            if isinstance(source, dict):
                return source.get(key, default)
            return getattr(source, key, default)

        nodes = []
        for node in lavalink.node_manager.nodes:
            stats = node.stats
            rest = getattr(node, "rest", None)
            raw_uri = getattr(rest, "uri", None)
            endpoint = getattr(raw_uri, "geturl", None)
            endpoint_str = endpoint() if callable(endpoint) else str(raw_uri or "")
            # Derive SSL flag from URI scheme with fallback to node.ssl.
            ssl_flag = bool(getattr(node, "ssl", False))
            if endpoint_str:
                lowered = endpoint_str.lower()
                if lowered.startswith("https://"):
                    ssl_flag = True
                elif lowered.startswith("http://"):
                    ssl_flag = False

            cpu_stats = _stat(stats, "cpu")
            mem_stats = _stat(stats, "memory")
            nodes.append(
                {
                    "name": node.name,
                    "region": node.region,
                    "endpoint": endpoint_str or "unknown",
                    "ssl": ssl_flag,
                    "players": getattr(stats, "players", 0),
                    "playing": getattr(stats, "playing_players", 0),
                    "uptime_ms": _stat(stats, "uptime"),
                    "cpu_system": _stat(cpu_stats, "system_load"),
                    "cpu_lavalink": _stat(cpu_stats, "lavalink_load"),
                    "cpu_cores": _stat(cpu_stats, "cores"),
                    "memory_used": _stat(mem_stats, "used"),
                    "memory_allocated": _stat(mem_stats, "allocated"),
                    "memory_free": _stat(mem_stats, "free"),
                    "memory_reservable": _stat(mem_stats, "reservable"),
                    "frames": _stat(_stat(stats, "frame_stats"), "sent"),
                    "deficit": _stat(_stat(stats, "frame_stats"), "deficit"),
                    "nulled": _stat(_stat(stats, "frame_stats"), "nulled"),
                    "penalties": getattr(stats, "penalty_total", None),
                }
            )
        return nodes

    async def _timed_ping(self, label: str, coro: asyncio.Future, timeout: float = 1.5) -> Tuple[str, Optional[float], bool]:
        """Run a coroutine with a timeout and measure duration in ms."""
        start = time.perf_counter()
        try:
            await asyncio.wait_for(coro, timeout=timeout)
            duration = (time.perf_counter() - start) * 1000
            return label, duration, True
        except Exception:
            return label, None, False

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

    def _latency_snapshot(self) -> Tuple[float, float, float, list[Tuple[int, float]], Optional[float]]:
        """Return best/avg/p95, per-shard latencies (ms) and loop lag if available."""
        monitor = getattr(self.bot, "latency_monitor", None)
        if monitor:
            snap = monitor.snapshot()
            shard_pairs = sorted((sid, round(lat, 2)) for sid, lat in snap.shards.items())
            return snap.best, snap.average, snap.p95, shard_pairs, snap.loop_lag_ms

        shard_pairs = [(sid, round(lat * 1000, 2)) for sid, lat in getattr(self.bot, "latencies", [])]
        latency_values = [lat for _, lat in shard_pairs] or [round(self.bot.latency * 1000, 2)]
        gateway_best = min(latency_values)
        gateway_avg = statistics.mean(latency_values)
        gateway_p95 = sorted(latency_values)[max(0, int(0.95 * (len(latency_values) - 1)))]
        return gateway_best, gateway_avg, gateway_p95, shard_pairs, None

    @staticmethod
    def _format_owner(app_info: discord.AppInfo) -> str:
        """Return a human-friendly owner/team label for the application."""
        team = getattr(app_info, "team", None)
        if team:
            team_name = getattr(team, "name", None) or f"Team {team.id}"
            owner_member = next(
                (member for member in getattr(team, "members", []) if getattr(member, "id", None) == getattr(team, "owner_id", None)),
                None,
            )
            owner_user = getattr(owner_member, "user", None) if owner_member else None
            owner_display = (
                getattr(owner_user, "global_name", None)
                or getattr(owner_user, "display_name", None)
                or getattr(owner_user, "name", None)
                or getattr(owner_member, "name", None)
            )
            return f"{team_name} (Owner: {owner_display})" if owner_display else team_name

        owner = getattr(app_info, "owner", None)
        if owner:
            return getattr(owner, "global_name", None) or getattr(owner, "display_name", None) or getattr(owner, "name", None) or str(owner)
        return "Unknown"

    # ------------------------------------------------------------------ commands
    @app_commands.command(name="ping", description="Quick latency & uptime snapshot for VectoBeat.")
    async def ping(self, inter: discord.Interaction) -> None:
        """Provide a quick glance at latency, uptime and shard information."""
        started_at = time.perf_counter()
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        uptime_seconds = int(HealthState.uptime())
        embed = factory.primary("🏓 VectoBeat Ping")
        embed.set_footer(text=f"VectoBeat v{VERSION} | {self.bot.user.name if self.bot.user else 'Bot'}")

        shard_total = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
        shard_id = inter.guild.shard_id + 1 if inter.guild else "N/A"

        gateway_best, gateway_avg, gateway_p95, shard_latencies, loop_lag_ms = self._latency_snapshot()

        # Optional service pings gathered in parallel; kept short with timeouts.
        pings: list[Tuple[str, Optional[float], bool]] = []
        playlist_service = getattr(self.bot, "playlist_service", None)
        autoplay_service = getattr(self.bot, "autoplay_service", None)
        tasks = []
        if playlist_service and hasattr(playlist_service, "ping"):
            tasks.append(asyncio.create_task(self._timed_ping("Playlist (Redis)", playlist_service.ping())))
        if autoplay_service and hasattr(autoplay_service, "ping"):
            tasks.append(asyncio.create_task(self._timed_ping("Autoplay (Redis)", autoplay_service.ping())))

        if tasks:
            done, pending = await asyncio.wait(tasks, timeout=0.75)
            for task in pending:
                task.cancel()
            for task in done:
                try:
                    pings.append(task.result())
                except Exception:
                    continue

        processing_ms = max(0.0, (time.perf_counter() - started_at) * 1000)

        embed.add_field(
            name="Gateway Latency",
            value=f"`best {gateway_best:.1f} ms • avg {gateway_avg:.1f} ms • p95 {gateway_p95:.1f} ms`",
            inline=False,
        )
        embed.add_field(name="Command Handling", value=f"`{processing_ms:.1f} ms`", inline=True)
        embed.add_field(name="Uptime", value=f"`{self._format_duration(uptime_seconds)}`", inline=True)
        embed.add_field(name="Shard", value=f"`{shard_id}/{shard_total}`", inline=True)
        if loop_lag_ms is not None:
            embed.add_field(name="Loop Lag", value=f"`{loop_lag_ms:.1f} ms`", inline=True)

        # Lavalink node visibility to highlight transport health.
        nodes = self._lavalink_nodes()
        if nodes:
            lines = []
            for node in nodes:
                status = "🟢" if node["players"] or node["playing"] is not None else "🟡"
                lines.append(f"{status} {node['name']} (`{node['region']}`) — {node['playing']}/{node['players']} active")
            embed.add_field(name="Lavalink", value="\n".join(lines), inline=False)

        if pings:
            ping_lines = []
            for label, duration, ok in pings:
                if ok and duration is not None:
                    ping_lines.append(f"✅ {label}: `{duration:.1f} ms`")
                else:
                    ping_lines.append(f"⚠️ {label}: failed/timeout")
            embed.add_field(name="Backends", value="\n".join(ping_lines), inline=False)

        await inter.response.send_message(embed=embed)

    @app_commands.command(name="status", description="Show detailed diagnostics for VectoBeat.")
    async def status(self, inter: discord.Interaction) -> None:
        """Provide deep diagnostics including latencies, guild footprint and process metrics."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)

        async with self._status_lock:
            uptime_seconds = HealthState.uptime()
            shard_total = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
            best_latency, avg_latency, p95_latency, shard_latencies, loop_lag_ms = self._latency_snapshot()

            guild_count = len(self.bot.guilds)
            text_channels = sum(len(g.text_channels) for g in self.bot.guilds)
            voice_channels = sum(len(g.voice_channels) for g in self.bot.guilds)
            member_count = sum(g.member_count or 0 for g in self.bot.guilds)

            players, active_players, queued_tracks = self._lavalink_metrics()
            voice_connections = len(self.bot.voice_clients)

            cpu_percent, memory_mb = self._process_metrics()

            # Backend/service probes
            playlist_service = getattr(self.bot, "playlist_service", None)
            autoplay_service = getattr(self.bot, "autoplay_service", None)
            backends: list[str] = []
            backend_tasks = []
            if playlist_service and hasattr(playlist_service, "ping"):
                backend_tasks.append(asyncio.create_task(self._timed_ping("Playlist (Redis)", playlist_service.ping())))
            if autoplay_service and hasattr(autoplay_service, "ping"):
                backend_tasks.append(asyncio.create_task(self._timed_ping("Autoplay (Redis)", autoplay_service.ping())))
            if backend_tasks:
                done, pending = await asyncio.wait(backend_tasks, timeout=0.75)
                for task in pending:
                    task.cancel()
                for task in done:
                    try:
                        label, duration, ok = task.result()
                    except Exception:
                        continue
                    if ok and duration is not None:
                        backends.append(f"✅ {label} `{duration:.1f} ms`")
                    else:
                        backends.append(f"⚠️ {label} timeout/failed")

            embed = factory.primary("📊 VectoBeat Diagnostics")
            embed.set_footer(text=f"VectoBeat v{VERSION} | {self.bot.user.name if self.bot.user else 'Bot'}")
            embed.description = "Comprehensive runtime metrics for monitoring and support."

            shard_lines = [f"`#{sid}` {lat:.1f} ms" for sid, lat in shard_latencies] or ["`#1` n/a"]
            embed.add_field(
                name="Latency",
                value=f"`best {best_latency:.1f} • avg {avg_latency:.1f} • p95 {p95_latency:.1f} ms`\n"
                + "\n".join(shard_lines),
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
                value="\n".join(
                    [
                        f"`{self._format_number(guild_count)}` guilds",
                        f"`{self._format_number(member_count)}` members",
                        (
                            f"`{self._format_number(text_channels)}` text / "
                            f"`{self._format_number(voice_channels)}` voice channels"
                        ),
                    ]
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
            nodes = self._lavalink_nodes()
            if nodes:
                node_lines = []
                for node in nodes:
                    cpu_sys = node.get("cpu_system") or 0.0
                    cpu_ll = node.get("cpu_lavalink") or 0.0
                    mem_used = node.get("memory_used")
                    mem_alloc = node.get("memory_allocated")
                    playing = node.get("playing") or 0
                    players_count = node.get("players") or 0
                    node_lines.append(
                        f"{node['name']} (`{node['region']}`) — players {playing}/{players_count} | "
                        f"CPU {cpu_ll*100:.1f}% LL / {cpu_sys*100:.1f}% SYS | "
                        f"Mem {self._format_bytes(mem_used)} / {self._format_bytes(mem_alloc)}"
                    )
                embed.add_field(name="Lavalink Nodes", value="\n".join(node_lines), inline=False)

            runtime_info = "\n".join(
                [
                    f"Python `{platform.python_version()}`",
                    f"discord.py `{discord.__version__}`",
                    f"Host `{platform.system()} {platform.release()}`",
                ]
            )
            embed.add_field(name="Runtime", value=runtime_info, inline=True)

            process_lines = []
            if cpu_percent is not None:
                process_lines.append(f"CPU `{cpu_percent:.1f}%`")
            if memory_mb is not None:
                process_lines.append(f"RAM `{memory_mb:.1f} MB`")
            if process_lines:
                embed.add_field(name="Process", value="\n".join(process_lines), inline=True)
            if loop_lag_ms is not None:
                embed.add_field(name="Loop Lag", value=f"`{loop_lag_ms:.1f} ms`", inline=True)

            if backends:
                embed.add_field(name="Backends", value="\n".join(backends), inline=False)

            await inter.response.send_message(embed=embed)

    @app_commands.command(name="uptime", description="Show bot uptime with start timestamp.")
    async def uptime(self, inter: discord.Interaction) -> None:
        """Display bot uptime along with the start timestamp."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        uptime_seconds = HealthState.uptime()
        started_at = datetime.datetime.fromtimestamp(
            HealthState.started_at, tz=datetime.timezone.utc
        )
        uptime_hms = self._format_duration(uptime_seconds)
        uptime_days = f"{uptime_seconds/86400:.2f} days"
        embed = factory.primary("⏱️ Uptime")
        embed.description = "Bot uptime and start time."
        embed.add_field(name="Uptime", value=f"`{uptime_hms}`\n`{uptime_days}`", inline=False)
        embed.add_field(name="Started", value=self._format_datetime(started_at), inline=False)
        embed.add_field(
            name="Uptime %",
            value=f"`{HealthState.uptime_percent():.2f}%` since first start",
            inline=True,
        )
        if factory.theme.thumbnail_url:
            embed.set_thumbnail(url=factory.theme.thumbnail_url)
        await inter.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="botinfo", description="Comprehensive information about the running bot.")
    async def botinfo(self, inter: discord.Interaction) -> None:
        """Present application metadata, reach and runtime environment information."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        app_info = await self.bot.application_info()
        owner_label = self._format_owner(app_info)
        guild_count = len(self.bot.guilds)
        total_members = sum(g.member_count or 0 for g in self.bot.guilds)
        if inter.guild:
            unique_users = len({member.id for member in inter.guild.members})
        else:
            seen_users: set[int] = set()
            for guild in self.bot.guilds:
                seen_users.update(member.id for member in guild.members)
            unique_users = len(seen_users)
        cpu_percent, memory_mb = self._process_metrics()
        shard_total = self.bot.shard_count or max(1, len(getattr(self.bot, "shards", {})) or 1)
        shard_latencies = [(sid, round(lat * 1000, 2)) for sid, lat in getattr(self.bot, "latencies", [])]
        latency_values = [lat for _, lat in shard_latencies] or [round(self.bot.latency * 1000, 2)]
        gateway_avg = statistics.mean(latency_values)
        gateway_best = min(latency_values)
        uptime_seconds = HealthState.uptime()
        lifetime_percent = HealthState.uptime_percent()
        first_seen = datetime.datetime.fromtimestamp(HealthState.first_seen, tz=datetime.timezone.utc)

        embed = factory.primary("🤖 Bot Information")
        embed.add_field(name="Application", value=f"`{app_info.name}`", inline=True)
        if owner_label:
            embed.add_field(name="Owner", value=owner_label, inline=True)
        embed.add_field(name="Command Count", value=f"`{len(self.bot.tree.get_commands())}`", inline=True)
        reach_lines = [
            f"`{self._format_number(guild_count)}` guilds",
            f"`{self._format_number(total_members)}` total members",
            f"`{self._format_number(unique_users)}` unique users",
        ]
        embed.add_field(name="Reach", value="\n".join(reach_lines), inline=False)
        embed.add_field(
            name="Shards & Latency",
            value=(
                f"`{shard_total}` shard(s)\n"
                f"`best {gateway_best:.1f} ms • avg {gateway_avg:.1f} ms`"
            ),
            inline=True,
        )
        embed.add_field(
            name="Uptime",
            value="\n".join(
                [
                    f"`{self._format_duration(uptime_seconds)}` current",
                    f"`{lifetime_percent:.2f}%` since {discord.utils.format_dt(first_seen, style='R')}",
                ]
            ),
            inline=True,
        )
        runtime_meta = "\n".join(
            [
                f"Python `{platform.python_version()}`",
                f"discord.py `{discord.__version__}`",
                f"Host `{platform.system()} {platform.release()}`",
            ]
        )
        embed.add_field(name="Runtime", value=runtime_meta, inline=True)
        if cpu_percent is not None or memory_mb is not None:
            process_lines = []
            if cpu_percent is not None:
                process_lines.append(f"CPU `{cpu_percent:.1f}%`")
            if memory_mb is not None:
                process_lines.append(f"RAM `{memory_mb:.1f} MB`")
            embed.add_field(name="Process", value="\n".join(process_lines), inline=True)

        if factory.theme.thumbnail_url:
            embed.set_thumbnail(url=factory.theme.thumbnail_url)
        view = discord.ui.View()
        website_url = "https://vectobeat.uplytech.de"
        invite_url = (
            f"https://discord.com/api/oauth2/authorize?client_id={app_info.id}"
            "&permissions=36768832&scope=bot%20applications.commands%20identify"
        )
        view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=website_url, label="Website"))
        view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=invite_url, label="Invite Bot"))
        await inter.response.send_message(embed=embed, view=view)

    @app_commands.command(name="guildinfo", description="Detailed information about this guild.")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def guildinfo(self, inter: discord.Interaction) -> None:
        """Show information about the guild the command is run in."""
        if not inter.guild:
            return await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)

        guild = inter.guild
        factory = EmbedFactory(guild.id)
        embed = factory.primary(f"🏠 Guild Information — {guild.name}")
        embed.description = self._format_datetime(guild.created_at)

        owner = guild.owner or await self.bot.fetch_user(guild.owner_id)
        owner_value = f"{owner} (`||{owner.id}||`)"
        embed.add_field(name="Owner", value=owner_value, inline=True)

        total_members = guild.member_count or len(guild.members) or 0
        embed.add_field(name="Members", value=f"`{total_members}`", inline=True)

        bot_count = sum(1 for member in guild.members if getattr(member, "bot", False)) if guild.members else 0
        human_count = max(total_members - bot_count, 0)
        embed.add_field(name="Humans / Bots", value=f"`{human_count}` / `{bot_count}`", inline=True)

        embed.add_field(
            name="Channels",
            value=(
                f"Text `{len(guild.text_channels)}`\n"
                f"Voice `{len(guild.voice_channels)}`\n"
                f"Stage `{len(guild.stage_channels)}`"
            ),
            inline=True,
        )
        sorted_roles = sorted(guild.roles, key=lambda role: role.position, reverse=True)
        top_roles = [role.mention for role in sorted_roles if role != guild.default_role][:5]
        top_roles_display = ", ".join(top_roles) if top_roles else "None"
        embed.add_field(
            name="Roles",
            value=f"`{len(guild.roles)}` total\nTop: {top_roles_display}",
            inline=True,
        )

        boosts = guild.premium_subscription_count or 0
        boost_tier = getattr(guild, "premium_tier", None)
        embed.add_field(
            name="Boosts",
            value=f"`{boosts}` boosts • Tier `{boost_tier}`",
            inline=True,
        )

        verification = getattr(guild, "verification_level", None)
        nsfw_level = getattr(guild, "nsfw_level", None)
        locale = getattr(guild, "preferred_locale", "n/a")
        embed.add_field(
            name="Safety",
            value="\n".join(
                [
                    f"Verification: `{verification.name if verification else 'n/a'}`",
                    f"NSFW Level: `{nsfw_level.name if nsfw_level else 'n/a'}`",
                    f"Locale: `{locale}`",
                ]
            ),
            inline=True,
        )

        afk_channel = guild.afk_channel.mention if guild.afk_channel else "None"
        afk_timeout = f"{guild.afk_timeout}s" if guild.afk_timeout else "n/a"
        system_channel = guild.system_channel.mention if guild.system_channel else "None"
        widget_status = "Enabled" if guild.widget_enabled else "Disabled"
        embed.add_field(
            name="System",
            value="\n".join(
                [
                    f"AFK: {afk_channel} ({afk_timeout})",
                    f"System: {system_channel}",
                    f"Widget: `{widget_status}`",
                ]
            ),
            inline=True,
        )

        emojis_count = len(guild.emojis)
        stickers_count = len(guild.stickers)
        embed.add_field(
            name="Assets",
            value=f"Emojis `{emojis_count}`\nStickers `{stickers_count}`",
            inline=True,
        )

        feature_labels = {
            "ANIMATED_BANNER": "Animated Banner",
            "ANIMATED_ICON": "Animated Icon",
            "BANNER": "Banner",
            "COMMUNITY": "Community",
            "DISCOVERABLE": "Discoverable",
            "FEATURES_HUB": "Features Hub",
            "INVITE_SPLASH": "Invite Splash",
            "MEMBER_VERIFICATION_GATE_ENABLED": "Membership Screening",
            "NEWS": "News Channels",
            "PARTNERED": "Partnered",
            "PREVIEW_ENABLED": "Preview",
            "PRIVATE_THREADS": "Private Threads",
            "ROLE_ICONS": "Role Icons",
            "TICKETED_EVENTS_ENABLED": "Ticketed Events",
            "VANITY_URL": "Vanity URL",
            "VERIFIED": "Verified",
            "VIP_REGIONS": "VIP Regions",
        }
        features = ", ".join(feature_labels.get(feat, feat.replace("_", " ").title()) for feat in sorted(guild.features)) or "_None_"
        embed.add_field(name="Features", value=features, inline=False)

        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)

        view = discord.ui.View()
        if guild.icon:
            view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=guild.icon.url, label="Open Icon"))
        if guild.banner:
            view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=guild.banner.url, label="Open Banner"))
        if guild.splash:
            view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=guild.splash.url, label="Open Splash"))
        if guild.vanity_url_code:
            vanity_url = f"https://discord.gg/{guild.vanity_url_code}"
            view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=vanity_url, label="Vanity URL"))

        await inter.response.send_message(embed=embed, view=view)

    @app_commands.command(name="lavalink", description="Inspect Lavalink node performance.")
    async def lavalink(self, inter: discord.Interaction) -> None:
        """Display per-node Lavalink metrics such as CPU and memory usage."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        nodes = self._lavalink_nodes()
        if not nodes:
            warning_embed = factory.warning("Lavalink is not connected.")
            return await inter.response.send_message(embed=warning_embed, ephemeral=True)

        embed = factory.primary("🎛️ Lavalink Nodes")
        for node in nodes:
            cpu_ll = node.get("cpu_lavalink")
            cpu_sys = node.get("cpu_system")
            cpu_line = (
                f"CPU `{cpu_ll * 100:.1f}%` LL / `{cpu_sys * 100:.1f}%` SYS"
                if cpu_ll is not None and cpu_sys is not None
                else f"CPU `{cpu_ll * 100:.1f}%` LL" if cpu_ll is not None else "CPU `n/a`"
            )
            if cpu_sys is not None and cpu_ll is None:
                cpu_line = f"CPU `{cpu_sys * 100:.1f}%` SYS"
            if node.get("cpu_cores") is not None:
                cpu_line += f" • cores `{node['cpu_cores']}`"
            memory_line = (
                f"Memory used `{self._format_bytes(node['memory_used'])}` / "
                f"`{self._format_bytes(node['memory_allocated'])}`"
            )
            mem_free = node.get("memory_free")
            mem_res = node.get("memory_reservable")
            if mem_free is not None or mem_res is not None:
                memory_line += f"\nFree `{self._format_bytes(mem_free)}` • Reservable `{self._format_bytes(mem_res)}`"

            uptime_line = ""
            if node.get("uptime_ms") is not None:
                uptime_line = f"Uptime `{self._format_duration(node['uptime_ms'] / 1000)}`"

            endpoint_line = f"Endpoint `||{node['endpoint']}||` (SSL {self._bool_icon(bool(node['ssl']))})"

            lines = [
                f"Region `{node['region']}`",
                endpoint_line,
                f"Players `{node['playing']}/{node['players']}`",
                cpu_line,
                memory_line,
            ]
            if uptime_line:
                lines.append(uptime_line)

            if node["frames"] is not None:
                frame_line = (
                    f"Frames sent `{node['frames']}`, deficit `{node['deficit']}`, "
                    f"nulled `{node['nulled']}`"
                )
                lines.append(frame_line)
            if node.get("penalties") is not None:
                lines.append(f"Penalties `{node['penalties']}`")
            embed.add_field(name=node["name"], value="\n".join(lines), inline=False)

        await inter.response.send_message(embed=embed)

    @app_commands.command(name="permissions", description="Show the bot's permissions in this channel.")
    async def permissions(self, inter: discord.Interaction) -> None:
        """Display the bot's effective permissions for the current channel."""
        if not inter.guild or not inter.channel:
            message = "This command must be invoked inside a guild channel."
            return await inter.response.send_message(message, ephemeral=True)

        guild = inter.guild
        me = guild.me or guild.get_member(self.bot.user.id)  # type: ignore
        if not me:
            return await inter.response.send_message("Unable to identify myself in this guild.", ephemeral=True)

        perms = inter.channel.permissions_for(me)
        factory = EmbedFactory(guild.id)
        embed = factory.primary(f"🔐 Permissions — {inter.channel.name}")

        recommended = {
            "view_channel": "View Channel",
            "send_messages": "Send Messages",
            "embed_links": "Embed Links",
            "attach_files": "Attach Files",
            "add_reactions": "Add Reactions",
            "use_external_emojis": "Use External Emojis",
            "read_message_history": "Read Message History",
            "use_slash_commands": "Use Application Commands",
        }
        voice = {
            "connect": "Connect",
            "speak": "Speak",
            "use_voice_activation": "Use Voice Activity",
            "stream": "Video/Stream",
            "priority_speaker": "Priority Speaker",
        }
        moderation = {
            "manage_messages": "Manage Messages",
            "move_members": "Move Members",
            "mute_members": "Mute Members",
            "deafen_members": "Deafen Members",
        }

        def render(section: dict[str, str]) -> list[str]:
            return [f"{self._bool_icon(getattr(perms, key, False))} {label}" for key, label in section.items()]

        missing = [label for key, label in recommended.items() if not getattr(perms, key, False)]

        embed.add_field(name="Channel", value="\n".join(render(recommended)), inline=False)
        embed.add_field(name="Voice", value="\n".join(render(voice)), inline=True)
        embed.add_field(name="Moderation", value="\n".join(render(moderation)), inline=True)

        guild_perms = guild.me.guild_permissions  # type: ignore
        elevated = []
        for attr, label in [("administrator", "Administrator"), ("manage_guild", "Manage Guild"), ("manage_roles", "Manage Roles")]:
            elevated.append(f"{self._bool_icon(getattr(guild_perms, attr, False))} {label}")
        embed.add_field(name="Guild Level", value="\n".join(elevated), inline=False)

        if missing:
            embed.add_field(name="Missing (recommended)", value=", ".join(missing), inline=False)
        embed.add_field(name="Permission Integer", value=f"`{me.guild_permissions.value}`", inline=True)

        invite_url = (
            f"https://discord.com/api/oauth2/authorize?client_id={self.bot.user.id}"
            "&permissions=36768832&scope=bot%20applications.commands%20identify"
        )
        view = discord.ui.View()
        view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=invite_url, label="Invite (recommended)"))
        view.add_item(
            discord.ui.Button(
                style=discord.ButtonStyle.link,
                url="https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ",
                label="Permissions FAQ",
            )
        )

        await inter.response.send_message(embed=embed, view=view, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(InfoCommands(bot))
