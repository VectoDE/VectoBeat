"""Configuration loader for VectoBeat.

This module centralises configuration concerns: it loads ``config.yml``,
overrides with environment variables (``.env``) and exposes globally accessible
objects the rest of the code base can rely on.
"""

import os
from typing import Dict

import yaml
from dotenv import load_dotenv

from .schema import (
    AnalyticsConfig,
    AppConfig,
    AutoplayConfig,
    CacheConfig,
    ChaosConfig,
    CrossfadeConfig,
    LavalinkConfig,
    MetricsConfig,
    QueueTelemetryConfig,
    RedisConfig,
    ScalingConfig,
    SearchLimitsConfig,
)

load_dotenv()  # Allows local development without exporting environment variables.


def _load_yaml(path: str) -> Dict:
    """Load a YAML config file, returning an empty dict if the file is blank."""
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
        return data or {}


_raw = _load_yaml(os.getenv("CONFIG_PATH", "config.yml"))
CONFIG = AppConfig(**_raw)

# .env overrides for Lavalink (if provided)
host = os.getenv("LAVALINK_HOST")
port = os.getenv("LAVALINK_PORT")
pwd = os.getenv("LAVALINK_PASSWORD")
https = os.getenv("LAVALINK_HTTPS")
name = os.getenv("LAVALINK_NAME")
region = os.getenv("LAVALINK_REGION")
if host or port or pwd or https or name or region:
    CONFIG.lavalink = LavalinkConfig(
        host=host or CONFIG.lavalink.host,
        port=int(port) if port else CONFIG.lavalink.port,
        password=pwd or CONFIG.lavalink.password,
        https=(https.lower() == "true") if isinstance(https, str) else CONFIG.lavalink.https,
        name=name or CONFIG.lavalink.name,
        region=region or CONFIG.lavalink.region,
    )

if CONFIG.lavalink_nodes:
    deduped = []
    seen = set()
    for node in CONFIG.lavalink_nodes:
        if node.name in seen:
            continue
        seen.add(node.name)
        deduped.append(node)
    CONFIG.lavalink_nodes = deduped
    CONFIG.lavalink = CONFIG.lavalink_nodes[0]
else:
    CONFIG.lavalink_nodes = [CONFIG.lavalink]

redis_host = os.getenv("REDIS_HOST")
redis_port = os.getenv("REDIS_PORT")
redis_pwd = os.getenv("REDIS_PASSWORD")
redis_db = os.getenv("REDIS_DB")
if redis_host or redis_port or redis_pwd or redis_db:
    CONFIG.redis = RedisConfig(
        host=redis_host or CONFIG.redis.host,
        port=int(redis_port) if redis_port else CONFIG.redis.port,
        password=redis_pwd or CONFIG.redis.password,
        db=int(redis_db) if redis_db else CONFIG.redis.db,
    )

autoplay_limit = os.getenv("AUTOPLAY_DISCOVERY_LIMIT")
autoplay_random = os.getenv("AUTOPLAY_RANDOM_PICK")
if autoplay_limit or autoplay_random:
    CONFIG.autoplay = AutoplayConfig(
        discovery_limit=int(autoplay_limit) if autoplay_limit else CONFIG.autoplay.discovery_limit,
        random_pick=(
            autoplay_random.lower() == "true"
            if isinstance(autoplay_random, str)
            else CONFIG.autoplay.random_pick
        ),
    )

crossfade_enabled = os.getenv("CROSSFADE_ENABLED")
crossfade_duration = os.getenv("CROSSFADE_DURATION_MS")
crossfade_steps = os.getenv("CROSSFADE_STEPS")
crossfade_floor = os.getenv("CROSSFADE_FLOOR_VOLUME")
if crossfade_enabled or crossfade_duration or crossfade_steps or crossfade_floor:
    CONFIG.crossfade = CrossfadeConfig(
        enabled=(
            crossfade_enabled.lower() == "true"
            if isinstance(crossfade_enabled, str)
            else CONFIG.crossfade.enabled
        ),
        duration_ms=int(crossfade_duration) if crossfade_duration else CONFIG.crossfade.duration_ms,
        fade_steps=int(crossfade_steps) if crossfade_steps else CONFIG.crossfade.fade_steps,
        floor_volume=int(crossfade_floor) if crossfade_floor else CONFIG.crossfade.floor_volume,
    )

metrics_enabled = os.getenv("METRICS_ENABLED")
metrics_host = os.getenv("METRICS_HOST")
metrics_port = os.getenv("METRICS_PORT")
metrics_interval = os.getenv("METRICS_INTERVAL")
if metrics_enabled or metrics_host or metrics_port or metrics_interval:
    CONFIG.metrics = MetricsConfig(
        enabled=(metrics_enabled.lower() == "true") if isinstance(metrics_enabled, str) else CONFIG.metrics.enabled,
        host=metrics_host or CONFIG.metrics.host,
        port=int(metrics_port) if metrics_port else CONFIG.metrics.port,
        collection_interval=int(metrics_interval) if metrics_interval else CONFIG.metrics.collection_interval,
    )

chaos_enabled = os.getenv("CHAOS_ENABLED")
chaos_interval = os.getenv("CHAOS_INTERVAL_MINUTES")
chaos_scenarios = os.getenv("CHAOS_SCENARIOS")
chaos_guilds = os.getenv("CHAOS_GUILD_ALLOWLIST")
if chaos_enabled or chaos_interval or chaos_scenarios or chaos_guilds:
    scenarios = CONFIG.chaos.scenarios
    if chaos_scenarios:
        scenarios = [item.strip() for item in chaos_scenarios.split(",") if item.strip()]
    guilds = CONFIG.chaos.guild_allowlist
    if chaos_guilds:
        guilds = [int(item.strip()) for item in chaos_guilds.split(",") if item.strip().isdigit()]
    CONFIG.chaos = ChaosConfig(
        enabled=(chaos_enabled.lower() == "true") if isinstance(chaos_enabled, str) else CONFIG.chaos.enabled,
        interval_minutes=int(chaos_interval) if chaos_interval else CONFIG.chaos.interval_minutes,
        scenarios=scenarios,
        guild_allowlist=guilds,
    )

scaling_enabled = os.getenv("SCALING_ENABLED")
scaling_endpoint = os.getenv("SCALING_ENDPOINT")
scaling_provider = os.getenv("SCALING_PROVIDER")
scaling_token = os.getenv("SCALING_AUTH_TOKEN")
scaling_interval = os.getenv("SCALING_INTERVAL_SECONDS")
scaling_cooldown = os.getenv("SCALING_COOLDOWN_SECONDS")
scaling_targets = os.getenv("SCALING_TARGETS")
if (
    scaling_enabled
    or scaling_endpoint
    or scaling_provider
    or scaling_token
    or scaling_interval
    or scaling_cooldown
    or scaling_targets
):
    target_guilds = CONFIG.scaling.target_guilds_per_shard
    target_players = CONFIG.scaling.target_players_per_node
    min_shards = CONFIG.scaling.min_shards
    max_shards = CONFIG.scaling.max_shards
    min_nodes = CONFIG.scaling.min_lavalink_nodes
    max_nodes = CONFIG.scaling.max_lavalink_nodes
    if scaling_targets:
        parts = scaling_targets.split(",")
        if len(parts) >= 2:
            try:
                target_guilds = int(parts[0])
                target_players = int(parts[1])
            except ValueError:
                pass
    CONFIG.scaling = ScalingConfig(
        enabled=(scaling_enabled.lower() == "true") if isinstance(scaling_enabled, str) else CONFIG.scaling.enabled,
        provider=scaling_provider or CONFIG.scaling.provider,
        endpoint=scaling_endpoint or CONFIG.scaling.endpoint,
        auth_token=scaling_token or CONFIG.scaling.auth_token,
        interval_seconds=int(scaling_interval) if scaling_interval else CONFIG.scaling.interval_seconds,
        cooldown_seconds=int(scaling_cooldown) if scaling_cooldown else CONFIG.scaling.cooldown_seconds,
        target_guilds_per_shard=target_guilds,
        target_players_per_node=target_players,
        min_shards=min_shards,
        max_shards=max_shards,
        min_lavalink_nodes=min_nodes,
        max_lavalink_nodes=max_nodes,
    )

analytics_enabled = os.getenv("ANALYTICS_ENABLED")
analytics_endpoint = os.getenv("ANALYTICS_ENDPOINT")
analytics_key = os.getenv("ANALYTICS_API_KEY")
analytics_flush = os.getenv("ANALYTICS_FLUSH_INTERVAL")
analytics_batch = os.getenv("ANALYTICS_BATCH_SIZE")
analytics_path = os.getenv("ANALYTICS_STORAGE_PATH")
analytics_salt = os.getenv("ANALYTICS_HASH_SALT")
if (
    analytics_enabled
    or analytics_endpoint
    or analytics_key
    or analytics_flush
    or analytics_batch
    or analytics_path
    or analytics_salt
):
    CONFIG.analytics = AnalyticsConfig(
        enabled=(
            analytics_enabled.lower() == "true"
            if isinstance(analytics_enabled, str)
            else CONFIG.analytics.enabled
        ),
        endpoint=analytics_endpoint or CONFIG.analytics.endpoint,
        api_key=analytics_key or CONFIG.analytics.api_key,
        flush_interval_seconds=int(analytics_flush)
        if analytics_flush
        else CONFIG.analytics.flush_interval_seconds,
        batch_size=int(analytics_batch) if analytics_batch else CONFIG.analytics.batch_size,
        storage_path=analytics_path or CONFIG.analytics.storage_path,
        hash_salt=analytics_salt or CONFIG.analytics.hash_salt,
    )

telemetry_enabled = os.getenv("QUEUE_TELEMETRY_ENABLED")
telemetry_endpoint = os.getenv("QUEUE_TELEMETRY_ENDPOINT")
telemetry_key = os.getenv("QUEUE_TELEMETRY_API_KEY")
telemetry_include = os.getenv("QUEUE_TELEMETRY_INCLUDE_GUILD")
if telemetry_enabled or telemetry_endpoint or telemetry_key or telemetry_include:
    CONFIG.queue_telemetry = QueueTelemetryConfig(
        enabled=(
            telemetry_enabled.lower() == "true"
            if isinstance(telemetry_enabled, str)
            else CONFIG.queue_telemetry.enabled
        ),
        endpoint=telemetry_endpoint or CONFIG.queue_telemetry.endpoint,
        api_key=telemetry_key or CONFIG.queue_telemetry.api_key,
        include_guild_metadata=(
            telemetry_include.lower() == "true"
            if isinstance(telemetry_include, str)
            else CONFIG.queue_telemetry.include_guild_metadata
        ),
    )

cache_search_enabled = os.getenv("CACHE_SEARCH_ENABLED")
cache_search_ttl = os.getenv("CACHE_SEARCH_TTL_SECONDS")
cache_search_max = os.getenv("CACHE_SEARCH_MAX_ENTRIES")
if cache_search_enabled or cache_search_ttl or cache_search_max:
    CONFIG.cache = CacheConfig(
        search_enabled=(
            cache_search_enabled.lower() == "true"
            if isinstance(cache_search_enabled, str)
            else CONFIG.cache.search_enabled
        ),
        search_ttl_seconds=int(cache_search_ttl) if cache_search_ttl else CONFIG.cache.search_ttl_seconds,
        search_max_entries=int(cache_search_max) if cache_search_max else CONFIG.cache.search_max_entries,
    )

search_base = os.getenv("SEARCH_BASE_RESULTS")
search_max = os.getenv("SEARCH_MAX_RESULTS")
search_min = os.getenv("SEARCH_MIN_RESULTS")
search_latency = os.getenv("SEARCH_HIGH_LATENCY_THRESHOLD_MS")
if search_base or search_max or search_min or search_latency:
    CONFIG.search_limits = SearchLimitsConfig(
        base_results=int(search_base) if search_base else CONFIG.search_limits.base_results,
        max_results=int(search_max) if search_max else CONFIG.search_limits.max_results,
        min_results=int(search_min) if search_min else CONFIG.search_limits.min_results,
        high_latency_threshold_ms=int(search_latency)
        if search_latency
        else CONFIG.search_limits.high_latency_threshold_ms,
    )

_discord_token = os.getenv("DISCORD_TOKEN")
if not _discord_token:
    raise RuntimeError("DISCORD_TOKEN missing in .env")
DISCORD_TOKEN: str = _discord_token
