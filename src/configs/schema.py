"""Typed configuration models used throughout the project."""

from typing import Dict, Any, Optional

from pydantic import BaseModel, field_validator


class LavalinkConfig(BaseModel):
    """Connection settings for the Lavalink cluster."""

    host: str = "188.195.175.166"
    port: int = 2333
    password: str = "BabaPapa1"
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
    floor_volume: int = 15


class RedisConfig(BaseModel):
    """Redis connection configuration for playlist persistence."""

    host: str = "127.0.0.1"
    port: int = 6379
    password: Optional[str] = None
    db: int = 0


class AppConfig(BaseModel):
    """Root configuration container loaded from ``config.yml`` and ``.env``."""

    bot: BotConfig = BotConfig()
    theme: ThemeConfig = ThemeConfig()
    branding: Dict[str, Any] = {}
    lavalink: LavalinkConfig = LavalinkConfig()
    spotify: Optional[SpotifyConfig] = None
    limits: LimitsConfig = LimitsConfig()
    features: FeaturesConfig = FeaturesConfig()
    autoplay: AutoplayConfig = AutoplayConfig()
    crossfade: CrossfadeConfig = CrossfadeConfig()
    redis: RedisConfig = RedisConfig()
