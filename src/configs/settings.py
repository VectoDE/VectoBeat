"""Configuration loader for VectoBeat.

This module centralises configuration concerns: it loads ``config.yml``,
overrides with environment variables (``.env``) and exposes globally accessible
objects the rest of the code base can rely on.
"""

import os
from typing import Dict

import yaml
from dotenv import load_dotenv

from .schema import AppConfig, LavalinkConfig

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

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
if not DISCORD_TOKEN:
    raise RuntimeError("DISCORD_TOKEN missing in .env")
