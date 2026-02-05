"""Typed configuration models used throughout the project."""

from typing import Dict, Any, Optional, List

from pydantic import BaseModel, field_validator


class LavalinkConfig(BaseModel):
    """Connection settings for the Lavalink cluster."""

    host: str = "192.186.172.12"
    port: int = 2333
    password: str = "youshallnotpass"
    https: bool = False
    name: str = "main"
    region: str = "us"

    @field_validator("host", "password", "name", "region", mode="before")
    @classmethod
    def _strip_strings(cls, value: str):
        """Ensure configuration strings do not accidentally contain whitespace."""
        if isinstance(value, str):
            return value.strip()
        return value


class BotIntents(BaseModel):
    """Discord gateway intent toggles."""

    members: bool = False
    message_content: bool = False


class BotConfig(BaseModel):
    """Runtime behaviour toggles for the bot."""

    intents: BotIntents = BotIntents()
    sync_commands_on_start: bool = True
    shard_count: Optional[int] = None
    shard_ids: Optional[List[int]] = None


class ThemeConfig(BaseModel):
    """Branding information applied to embeds."""

    color_primary: int = 0x5865F2
    color_success: int = 0x57F287
    color_warning: int = 0xFEE75C
    color_error: int = 0xED4245
    footer_text: str = "VectoBeat"
    footer_icon_url: Optional[str] = None
    author_name: Optional[str] = "VectoDE"
    author_icon_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


class SpotifyConfig(BaseModel):
    """Optional Spotify credentials for third-party plugins."""

    client_id: Optional[str] = None
    client_secret: Optional[str] = None


class LimitsConfig(BaseModel):
    """Guardrails for queue and search behaviour."""

    queue_max_length: int = 500
    search_timeout_ms: int = 8000


class FeaturesConfig(BaseModel):
    """Feature flags controlling optional functionality."""

    allow_loop: bool = True
    allow_shuffle: bool = True


class AutoplayConfig(BaseModel):
    """Autoplay tuning parameters."""

    discovery_limit: int = 10
    random_pick: bool = True


class CrossfadeConfig(BaseModel):
    """Crossfade and gapless playback tuning."""

    enabled: bool = False
    duration_ms: int = 2000
    fade_steps: int = 10
    floor_volume: float = 15.0


class RedisConfig(BaseModel):
    """Redis connection configuration for playlist persistence."""

    host: str = "127.0.0.1"
    port: int = 6379
    password: Optional[str] = None
    db: int = 0
    ca_path: Optional[str] = None


class MetricsConfig(BaseModel):
    """Settings for the Prometheus metrics exporter."""

    enabled: bool = False
    host: str = "0.0.0.0"
    port: int = 3052
    collection_interval: int = 15


class StatusAPIConfig(BaseModel):
    """Configuration for the internal status HTTP API."""

    enabled: bool = True
    host: str = "0.0.0.0"
    port: int = 3051
    api_key: Optional[str] = None
    allow_unauthenticated: bool = False
    cache_ttl_seconds: int = 5
    push_endpoint: Optional[str] = None
    push_token: Optional[str] = None
    push_interval_seconds: int = 30
    event_endpoint: Optional[str] = None
    event_token: Optional[str] = None
    usage_endpoint: Optional[str] = None
    usage_token: Optional[str] = None
    control_start_cmd: Optional[str] = None
    control_stop_cmd: Optional[str] = None
    control_reload_cmd: Optional[str] = None
    control_reload_commands_cmd: Optional[str] = None
    control_restart_frontend_cmd: Optional[str] = None


class ControlPanelAPIConfig(BaseModel):
    """Remote control-panel API integration for per-guild settings."""

    enabled: bool = False
    base_url: str = "http://127.0.0.1:3000"
    api_key: Optional[str] = None
    timeout_seconds: int = 8
    cache_ttl_seconds: int = 120


class ChaosConfig(BaseModel):
    """Chaos testing playbook configuration."""

    enabled: bool = False
    interval_minutes: int = 360
    scenarios: List[str] = ["disconnect_voice", "disconnect_node", "inject_error"]
    guild_allowlist: List[int] = []


class ScalingConfig(BaseModel):
    """Auto scaling strategy configuration for shards and Lavalink nodes."""

    enabled: bool = False
    provider: str = "nomad"
    endpoint: Optional[str] = None
    auth_token: Optional[str] = None
    interval_seconds: int = 60
    cooldown_seconds: int = 300
    target_guilds_per_shard: int = 1200
    target_players_per_node: int = 150
    min_shards: int = 1
    max_shards: int = 10
    min_lavalink_nodes: int = 1
    max_lavalink_nodes: int = 5


class AnalyticsConfig(BaseModel):
    """Configuration for command analytics export."""

    enabled: bool = False
    endpoint: Optional[str] = None
    api_key: Optional[str] = None
    flush_interval_seconds: int = 30
    batch_size: int = 50
    storage_path: str = "data/command_analytics.log"
    hash_salt: str = "vectobeat"


class QueueTelemetryConfig(BaseModel):
    """Settings for queue telemetry webhooks."""

    enabled: bool = False
    endpoint: Optional[str] = None
    api_key: Optional[str] = None
    include_guild_metadata: bool = True


class AlertsConfig(BaseModel):
    """Configuration for moderator/on-call/compliance alert routing."""

    moderator_endpoint: Optional[str] = None
    incident_endpoint: Optional[str] = None
    priority_endpoint: Optional[str] = None
    compliance_endpoint: Optional[str] = None
    api_key: Optional[str] = None


class QueueSyncConfig(BaseModel):
    """Configuration for queue synchronization updates."""

    enabled: bool = False
    endpoint: Optional[str] = None
    api_key: Optional[str] = None


class CacheConfig(BaseModel):
    """Caching behaviour for expensive operations."""

    search_enabled: bool = True
    search_ttl_seconds: int = 60
    search_max_entries: int = 200


class SearchLimitsConfig(BaseModel):
    """Dynamic search result sizing."""

    base_results: int = 5
    max_results: int = 10
    min_results: int = 3
    high_latency_threshold_ms: int = 300


class SensitiveCommandConfig(BaseModel):
    """Allow-lists for staff-only slash commands."""

    success_pod_staff_ids: List[int] = []
    concierge_staff_ids: List[int] = []
    compliance_export_admin_ids: List[int] = []


class AppConfig(BaseModel):
    """Root configuration container loaded from ``config.yml`` and ``.env``."""

    bot: BotConfig = BotConfig()
    theme: ThemeConfig = ThemeConfig()
    branding: Dict[str, Any] = {}
    lavalink: LavalinkConfig = LavalinkConfig()
    lavalink_nodes: List[LavalinkConfig] = []
    spotify: Optional[SpotifyConfig] = None
    limits: LimitsConfig = LimitsConfig()
    features: FeaturesConfig = FeaturesConfig()
    autoplay: AutoplayConfig = AutoplayConfig()
    crossfade: CrossfadeConfig = CrossfadeConfig()
    redis: RedisConfig = RedisConfig()
    metrics: MetricsConfig = MetricsConfig()
    status_api: StatusAPIConfig = StatusAPIConfig()
    chaos: ChaosConfig = ChaosConfig()
    scaling: ScalingConfig = ScalingConfig()
    analytics: AnalyticsConfig = AnalyticsConfig()
    queue_telemetry: QueueTelemetryConfig = QueueTelemetryConfig()
    alerts: AlertsConfig = AlertsConfig()
    cache: CacheConfig = CacheConfig()
    search_limits: SearchLimitsConfig = SearchLimitsConfig()
    control_panel_api: ControlPanelAPIConfig = ControlPanelAPIConfig()
    queue_sync: QueueSyncConfig = QueueSyncConfig()
    security: SensitiveCommandConfig = SensitiveCommandConfig()
