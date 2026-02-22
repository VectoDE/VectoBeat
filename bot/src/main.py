"""Application bootstrap for the VectoBeat Discord bot.

This module wires together configuration, logging, Lavalink connectivity and
dynamic extension loading so the bot can be launched with a single call to
``python -m src.main``.  The module intentionally keeps side effects in the
``setup_hook`` lifecycle to make the import safe for testing.
"""

import logging
import os
from typing import Any, Awaitable, Callable, List, Optional, Union

import asyncio
import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import lavalink

import discord
from discord import app_commands
from discord.ext import commands

from src.configs.settings import CONFIG, DISCORD_TOKEN, VERSION
from src.services.health_service import HealthState
from src.services.autoplay_service import AutoplayService
from src.services.dj_permission_service import DJPermissionManager
from src.services.chaos_service import ChaosService
from src.services.command_analytics_service import CommandAnalyticsService
from src.services.command_throttle_service import CommandThrottleService
from src.services.analytics_export_service import AnalyticsExportService
from src.services.lavalink_service import LavalinkManager
from src.services.lyrics_service import LyricsService
from src.services.metrics_service import MetricsService
from src.services.playlist_service import PlaylistService
from src.services.profile_service import GuildProfileManager
from src.services.queue_telemetry_service import QueueTelemetryService
from src.services.alert_service import AlertService
from src.services.latency_service import LatencyMonitor
from src.services.search_cache import SearchCacheService
from src.services.status_api_service import StatusAPIService
from src.services.queue_sync_service import QueueSyncService
from src.services.queue_copilot_service import QueueCopilotService
from src.services.scaling_service import ScalingService
from src.services.server_settings_service import PanelParitySnapshot, ServerSettingsService
from src.services.shard_supervisor import ShardSupervisor
from src.services.automation_audit_service import AutomationAuditService
from src.services.success_pod_service import SuccessPodService
from src.services.concierge_service import ConciergeService
from src.services.scale_contact_service import ScaleContactService
from src.services.regional_routing_service import RegionalRoutingService
from src.services.federation_service import FederationService
from src.services.predictive_health_service import PredictiveHealthService
from src.services.plugin_service import PluginService
from src.utils.logger import setup_logging
from src.utils.embeds import set_branding_resolver
from src.utils.plan_capabilities import load_plan_capabilities_async

INTENTS = discord.Intents.default()
INTENTS.guilds = True
INTENTS.voice_states = True
INTENTS.members = CONFIG.bot.intents.members
INTENTS.message_content = True  # Requires privileged intent
MEMBER_CACHE_FLAGS = discord.MemberCacheFlags.none()
MESSAGE_CACHE_LIMIT = 1000
DEFAULT_COMMAND_PREFIX = "!"


class VectoBeat(commands.AutoShardedBot):
    """Main bot implementation.

    ``AutoShardedBot`` is used so that the bot can scale automatically when the
    guild count grows.  The class adds a Lavalink manager, structured cleanup
    hooks and eager cog loading.
    """

    def __init__(self, override_shard_count: Optional[int] = None):
        self.lavalink: lavalink.Client
        super().__init__(
            command_prefix=self._command_prefix_resolver,
            intents=INTENTS,
            help_command=None,
            shard_count=override_shard_count or CONFIG.bot.shard_count,
            shard_ids=CONFIG.bot.shard_ids,  # type: ignore[arg-type]
            chunk_guilds_at_startup=False,
            member_cache_flags=MEMBER_CACHE_FLAGS,
            max_messages=MESSAGE_CACHE_LIMIT,
        )
        self.logger: Optional[logging.Logger] = None
        self._cleanup_tasks: List[Union[Callable[[], Awaitable[None]], Awaitable[None]]] = []

        from typing import cast
        bot_cast = cast(commands.Bot, self)

        self.lavalink_manager = LavalinkManager(bot_cast, CONFIG.lavalink_nodes)
        self.profile_manager = GuildProfileManager()
        self.playlist_service = PlaylistService(CONFIG.redis)
        self.autoplay_service = AutoplayService(CONFIG.redis)
        self.lyrics_service = LyricsService()
        self.dj_permissions = DJPermissionManager()
        # Faster gateway recovery: restart shards if latency stays above 100ms.
        # Aggressive gateway recovery: recycle shards if latency remains above ~70 ms.
        self.shard_supervisor = ShardSupervisor(bot_cast, latency_threshold=0.07)
        self.metrics_service = MetricsService(bot_cast, CONFIG.metrics)
        self.chaos_service = ChaosService(bot_cast, CONFIG.chaos)
        self.scaling_service = ScalingService(bot_cast, CONFIG.scaling)
        self.analytics_service = CommandAnalyticsService(CONFIG.analytics)
        self.server_settings = ServerSettingsService(CONFIG.control_panel_api, default_prefix=DEFAULT_COMMAND_PREFIX)
        self.automation_audit = AutomationAuditService(CONFIG.control_panel_api, self.server_settings)
        self.success_pod = SuccessPodService(CONFIG.control_panel_api)
        self.concierge = ConciergeService(CONFIG.control_panel_api)
        self.regional_routing = RegionalRoutingService(bot_cast, self.server_settings, self.lavalink_manager)
        self.scale_contacts = ScaleContactService(CONFIG.control_panel_api)
        self.plugin_service = PluginService(self.server_settings)
        self.federation_service = FederationService(bot_cast, CONFIG.control_panel_api)
        self.predictive_health = PredictiveHealthService(bot_cast)
        self.command_throttle = CommandThrottleService(self.server_settings)
        self.analytics_export = AnalyticsExportService(self.server_settings, profile_manager=self.profile_manager)
        self.queue_telemetry = QueueTelemetryService(CONFIG.queue_telemetry, self.server_settings)
        self.alerts = AlertService(CONFIG.alerts, self.server_settings, self.queue_telemetry)
        self.queue_copilot = QueueCopilotService(self.server_settings)
        self.search_cache = SearchCacheService(CONFIG.cache)
        # Sample more frequently to keep gateway latency fresher.
        self.latency_monitor = LatencyMonitor(bot_cast, sample_interval=2.0, max_samples=60)
        self.status_api = StatusAPIService(bot_cast, CONFIG.status_api)
        self.queue_sync = QueueSyncService(CONFIG.queue_sync, self.server_settings)
        self._entrypoint_payloads: List[dict] = []
        self._panel_parity_task: Optional[asyncio.Task] = None
        self._prefix_cache: dict[int, tuple[str, float]] = {}
        # Persist uptime on shutdown
        self.add_cleanup_task(HealthState.persist_async)

    async def _command_prefix_resolver(self, bot: commands.Bot, message: discord.Message):
        """Resolve guild-specific command prefixes."""
        prefixes = [DEFAULT_COMMAND_PREFIX]
        guild = getattr(message, "guild", None)
        if guild and getattr(self, "server_settings", None):
            cached = self._prefix_cache.get(guild.id)
            now = self.loop.time()
            if cached and cached[1] > now:
                prefixes = [cached[0]]
            else:
                try:
                    prefix = await self.server_settings.prefix_for_guild(guild.id)
                    if prefix:
                        prefixes = [prefix]
                        # Cache prefix for 5 minutes to avoid repeated round-trips per message
                        self._prefix_cache[guild.id] = (prefix, now + 300)
                except Exception as exc:
                    if self.logger:
                        self.logger.debug("Failed to resolve prefix for guild %s: %s", guild.id, exc)
        return commands.when_mentioned_or(*prefixes)(bot, message)

    def add_cleanup_task(self, task: Union[Callable[[], Awaitable[None]], Awaitable[None]]) -> None:
        """Register an async callable that should run before the bot shuts down."""
        self._cleanup_tasks.append(task)

    async def close(self):
        """Run registered cleanup tasks and gracefully stop Lavalink."""
        if self._panel_parity_task:
            self._panel_parity_task.cancel()
            try:
                await self._panel_parity_task
            except asyncio.CancelledError:
                pass
            self._panel_parity_task = None
        for task in self._cleanup_tasks:
            try:
                if callable(task):
                    await task()
                else:
                    await task
            except Exception as e:
                if self.logger:
                    self.logger.error("Error during cleanup: %s", e)

        if hasattr(self, "lavalink_manager"):
            await self.lavalink_manager.close()

        if hasattr(self, "profile_manager"):
            await self.profile_manager.save()

        if hasattr(self, "playlist_service"):
            await self.playlist_service.close()

        if hasattr(self, "autoplay_service"):
            await self.autoplay_service.close()

        if hasattr(self, "lyrics_service"):
            await self.lyrics_service.close()

        if hasattr(self, "shard_supervisor"):
            await self.shard_supervisor.close()

        if hasattr(self, "metrics_service"):
            await self.metrics_service.close()
        if hasattr(self, "latency_monitor"):
            await self.latency_monitor.close()

        if hasattr(self, "chaos_service"):
            await self.chaos_service.close()

        if hasattr(self, "scaling_service"):
            await self.scaling_service.close()

        if hasattr(self, "analytics_service"):
            await self.analytics_service.close()

        if hasattr(self, "queue_telemetry"):
            await self.queue_telemetry.close()
        if hasattr(self, "alerts"):
            await self.alerts.close()
        if hasattr(self, "analytics_export"):
            await self.analytics_export.close()
        if hasattr(self, "queue_sync"):
            await self.queue_sync.close()
        if hasattr(self, "automation_audit"):
            await self.automation_audit.close()
        if hasattr(self, "success_pod"):
            await self.success_pod.close()
        if hasattr(self, "concierge"):
            await self.concierge.close()
        if hasattr(self, "regional_routing"):
            await self.regional_routing.close()
        if hasattr(self, "scale_contacts"):
            await self.scale_contacts.close()
        if hasattr(self, "federation_service"):
            await self.federation_service.close()
        if hasattr(self, "predictive_health"):
            await self.predictive_health.close()

        if hasattr(self, "status_api"):
            await self.status_api.close()
        if hasattr(self, "server_settings"):
            await self.server_settings.close()

        if hasattr(self, "search_cache"):
            self.search_cache = None

        for vc in list(self.voice_clients):
            try:
                await vc.disconnect(force=True)
            except Exception as e:
                if self.logger:
                    self.logger.error("Error disconnecting voice client: %s", e)

        await super().close()

    async def setup_hook(self):
        """Configure logging, initialise Lavalink and load extensions."""
        setup_logging()

        self.logger = logging.getLogger("VectoBeat")
        self.logger.info("Initializing VectoBeat v%s...", VERSION)

        await self.lavalink_manager.connect()
        self.playlist_service.logger = self.logger
        try:
            await self.playlist_service.ping()
        except Exception:
            if self.logger:
                self.logger.warning("Redis playlist backend is unreachable; playlist commands may fail.")
        self.autoplay_service.logger = self.logger
        try:
            await self.autoplay_service.ping()
        except Exception:
            if self.logger:
                self.logger.warning("Redis autoplay backend is unreachable; autoplay recommendations may fail.")
        self.lyrics_service.logger = logging.getLogger("VectoBeat.Lyrics")
        await self.shard_supervisor.start()
        await self.metrics_service.start()
        await self.chaos_service.start()
        await self.scaling_service.start()
        await self.analytics_service.start()
        await self.server_settings.start()
        await self.regional_routing.start()
        await self.automation_audit.start()
        await self.success_pod.start()
        await self.concierge.start()
        await self.federation_service.start()
        await self.scale_contacts.start()
        await self.predictive_health.start()
        set_branding_resolver(self.server_settings.branding_snapshot)
        await self.alerts.start()
        await self.analytics_export.start()
        await self.queue_telemetry.start()
        await self.queue_sync.start()
        await self.status_api.start()
        await self.dj_permissions.start()
        # search_cache is synchronous; no start required
        await self.latency_monitor.start()
        await HealthState.load_async()
        await load_plan_capabilities_async()

        if self._panel_parity_task:
            self._panel_parity_task.cancel()
        self._panel_parity_task = self.loop.create_task(self._validate_panel_parity_on_startup())

        # Load all cogs dynamically
        for pkg in ("events", "commands"):
            folder = os.path.join(os.path.dirname(__file__), pkg)
            for file in os.listdir(folder):
                if file.endswith(".py") and not file.startswith("__"):
                    ext = f"src.{pkg}.{file[:-3]}"
                    await self.load_extension(ext)
                    self.logger.info("Loaded extension: %s", ext)

        if CONFIG.bot.sync_commands_on_start:
            await self._sync_application_commands()

    async def _sync_application_commands(self) -> None:
        """Safely sync slash commands while preserving required entry-point commands."""
        if not self.logger:
            self.logger = logging.getLogger("VectoBeat")

        if self._entrypoint_payloads:
            await self._sync_preserving_entry_points(use_cached=True)
            return

        try:
            await self.tree.sync()
            self.logger.info("Slash commands synced.")
            return
        except discord.HTTPException as exc:
            if exc.status == 400 and exc.code == 50240:
                await self._sync_preserving_entry_points()
                return
            raise

    async def _get_preserved_entry_commands(self, commands: list[discord.app_commands.Command | discord.app_commands.Group], use_cached: bool) -> tuple[List[dict], List[str]]:
        if use_cached and self._entrypoint_payloads:
            preserved_payloads = list(self._entrypoint_payloads)
            preserved_names = [item.get("name", "unknown") for item in preserved_payloads]
            return preserved_payloads, preserved_names

        existing = await self.tree.fetch_commands()
        local_keys = {self._command_signature(command) for command in commands}
        preserved_payloads = []
        preserved_names = []

        for remote in existing:
            key = self._command_signature(remote)
            if key not in local_keys:
                data = remote.to_dict()
                preserved_payloads.append(data)  # type: ignore[arg-type]
                preserved_names.append(remote.name)

        self._entrypoint_payloads = preserved_payloads
        return preserved_payloads, preserved_names

    async def _sync_preserving_entry_points(self, *, use_cached: bool = False) -> None:
        """Include remote-only entry commands so Discord does not reject bulk updates."""
        assert self.application_id is not None
        translator = self.tree.translator
        commands = self.tree._get_all_commands()
        if translator:
            payload = [await command.get_translated_payload(self.tree, translator) for command in commands]
        else:
            payload = [command.to_dict(self.tree) for command in commands]

        preserved_payloads, preserved_names = await self._get_preserved_entry_commands(commands, use_cached)
        payload.extend(preserved_payloads)

        if preserved_names and self.logger:
            self.logger.warning(
                "Preserving remote entry-point commands during sync: %s", ", ".join(sorted(set(preserved_names)))
            )
        elif not preserved_payloads and self.logger:
            self.logger.warning("Entry-point sync error detected but no remote commands were found to preserve.")

        for command_payload in payload:
            command_payload.pop("integration_types", None)
            command_payload.pop("contexts", None)

        await self.tree._http.bulk_upsert_global_commands(self.application_id, payload=payload)
        if self.logger:
            self.logger.info(
                "Slash commands synced (%s preserved entry commands).",
                len(preserved_payloads),
            )

    async def _validate_panel_parity_on_startup(self) -> None:
        """Fetch control-panel settings for every guild and ensure we enforce them."""
        if not getattr(self, "server_settings", None) or not self.server_settings.enabled:
            return
        await self.wait_until_ready()
        guilds = list(self.guilds or [])
        if not guilds:
            return
        if self.logger:
            self.logger.info("Validating control-panel parity for %s guilds...", len(guilds))
        adjustments = 0
        for guild in guilds:
            try:
                snapshot = await self.server_settings.parity_snapshot(guild.id)
            except Exception as exc:
                if self.logger:
                    self.logger.warning("Unable to validate panel controls for guild %s: %s", guild.id, exc)
                continue
            if self.logger and self._log_panel_parity(guild, snapshot):
                adjustments += 1
            if hasattr(self, "regional_routing"):
                try:
                    await self.regional_routing.reconcile_guild(guild.id)
                except Exception as exc:  # pragma: no cover - defensive logging
                    if self.logger:
                        self.logger.debug("Routing reconcile failed for guild %s during startup: %s", guild.id, exc)
        if self.logger:
            self.logger.info(
                "Panel control validation finished for %s guilds (%s adjustments).",
                len(guilds),
                adjustments,
            )

    def _log_panel_parity(self, guild: discord.Guild, snapshot: PanelParitySnapshot) -> bool:
        """Log parity state for ``guild`` and return True if adjustments were required."""
        if not self.logger:
            return False
        adjusted = False
        if snapshot.plan_queue_cap is not None and snapshot.raw_queue_limit > snapshot.plan_queue_cap:
            adjusted = True
            self.logger.warning(
                "Guild %s (%s) requested queue cap %s above plan cap %s; enforcing %s.",
                guild.name,
                guild.id,
                snapshot.raw_queue_limit,
                snapshot.plan_queue_cap,
                snapshot.effective_queue_limit,
            )
        if snapshot.raw_region not in snapshot.allowed_regions:
            adjusted = True
            self.logger.warning(
                "Guild %s (%s) requested Lavalink region '%s' outside %s; using '%s'.",
                guild.name,
                guild.id,
                snapshot.raw_region,
                ", ".join(snapshot.allowed_regions),
                snapshot.effective_region,
            )
        if snapshot.raw_automation_mode != snapshot.automation_mode:
            adjusted = True
            self.logger.warning(
                "Guild %s (%s) requested automation '%s' but plan allows '%s'; clamped to '%s'.",
                guild.name,
                guild.id,
                snapshot.raw_automation_mode,
                snapshot.allowed_automation_mode,
                snapshot.automation_mode,
            )

        queue_summary = (
            "unlimited"
            if snapshot.plan_queue_cap is None
            else f"{snapshot.effective_queue_limit:,}"
        )
        self.logger.info(
            "Panel parity ok for %s (%s): queue=%s automation=%s region=%s branding=%s prefix=%s",
            guild.name,
            snapshot.tier.capitalize(),
            queue_summary,
            snapshot.automation_mode,
            snapshot.effective_region,
            snapshot.branding_accent,
            snapshot.prefix,
        )
        return adjusted

    @staticmethod
    def _command_signature(command: Any) -> tuple[str, int]:
        name = getattr(command, "name", "unnamed")
        raw_type = getattr(command, "type", None)
        if isinstance(raw_type, discord.AppCommandType):
            type_value = int(raw_type.value)
        elif isinstance(raw_type, int):
            type_value = int(raw_type)
        else:
            type_value = 1  # default to slash command
        return str(name), type_value
async def _fetch_exact_guild_count_and_run(token: str) -> None:
    import logging
    from discord.http import HTTPClient, Route
    http = HTTPClient(loop=asyncio.get_running_loop())

    logging.getLogger("discord").info("Querying global guild count to calculate exactly 5 shards/guild...")
    try:
        await http.static_login(token)
        # We fetch the first 1 response to get the exact count, or loop through if >200
        # Discord returns a list of user guilds. For a bot, /users/@me/guilds
        guilds = []
        after = None
        while True:
            params = {"limit": 200}
            if after:
                params["after"] = after
            resp = await http.request(Route("GET", "/users/@me/guilds"), params=params)
            guilds.extend(resp)
            if len(resp) < 200:
                break
            after = resp[-1]["id"]

        guild_count = len(guilds)
        shard_count = math.ceil(guild_count / 5.0) if guild_count > 0 else 1
        logging.getLogger("discord").info("Bot is in %d guilds. Enforcing exactly %d shards.", guild_count, shard_count)
    except Exception as exc:
        logging.getLogger("discord").error("Failed to query guild count from Discord API. Defaulting to 1 shard. %s", exc)
        shard_count = 1
    finally:
        await http.close()

    # Run the bot with the precise 5-guild shard count.
    bot_instance = VectoBeat(override_shard_count=shard_count)
    await bot_instance.start(token)

if __name__ == "__main__":
    asyncio.run(_fetch_exact_guild_count_and_run(DISCORD_TOKEN))
