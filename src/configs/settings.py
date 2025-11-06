"""Configuration loader for VectoBeat.

This module centralises configuration concerns: it loads ``config.yml``,
overrides with environment variables (``.env``) and exposes globally accessible
objects the rest of the code base can rely on.
"""

import os
from typing import Dict

import yaml
from dotenv import load_dotenv

from .schema import AppConfig, AutoplayConfig, CrossfadeConfig, LavalinkConfig, RedisConfig

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
        random_pick=(autoplay_random.lower() == "true") if isinstance(autoplay_random, str) else CONFIG.autoplay.random_pick,
    )

crossfade_enabled = os.getenv("CROSSFADE_ENABLED")
crossfade_duration = os.getenv("CROSSFADE_DURATION_MS")
crossfade_steps = os.getenv("CROSSFADE_STEPS")
crossfade_floor = os.getenv("CROSSFADE_FLOOR_VOLUME")
if crossfade_enabled or crossfade_duration or crossfade_steps or crossfade_floor:
    CONFIG.crossfade = CrossfadeConfig(
        enabled=(crossfade_enabled.lower() == "true") if isinstance(crossfade_enabled, str) else CONFIG.crossfade.enabled,
        duration_ms=int(crossfade_duration) if crossfade_duration else CONFIG.crossfade.duration_ms,
        fade_steps=int(crossfade_steps) if crossfade_steps else CONFIG.crossfade.fade_steps,
        floor_volume=int(crossfade_floor) if crossfade_floor else CONFIG.crossfade.floor_volume,
    )

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN missing in .env")
