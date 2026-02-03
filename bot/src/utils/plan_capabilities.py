"""Helper utilities to load plan capability definitions shared across the stack."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import aiofiles

logger = logging.getLogger("VectoBeat.PlanCapabilities")

PLAN_CAPABILITIES_PATH = Path(__file__).resolve().parents[3] / "plan-capabilities.json"

_DEFAULT_CAPABILITIES = {
    "free": {
        "serverSettings": {
            "aiRecommendations": False,
            "maxAutomationLevel": "off",
            "maxAnalyticsMode": "basic",
            "allowedLavalinkRegions": ["auto"],
        }
    }
}

_PLAN_CAPABILITIES: dict[str, dict[str, Any]] = _DEFAULT_CAPABILITIES.copy()


async def load_plan_capabilities_async() -> None:
    """Load plan capabilities from disk asynchronously."""
    global _PLAN_CAPABILITIES
    try:
        if PLAN_CAPABILITIES_PATH.exists():
            async with aiofiles.open(PLAN_CAPABILITIES_PATH, "r", encoding="utf-8") as f:
                content = await f.read()
            _PLAN_CAPABILITIES = json.loads(content)
            get_plan_capabilities.cache_clear()
            logger.info("Loaded plan capabilities from %s", PLAN_CAPABILITIES_PATH)
        else:
            logger.warning("Plan capabilities file not found at %s, using defaults", PLAN_CAPABILITIES_PATH)
    except Exception as e:
        logger.error("Failed to load plan capabilities: %s", e)
        _PLAN_CAPABILITIES = _DEFAULT_CAPABILITIES.copy()


@lru_cache(maxsize=None)
def get_plan_capabilities(tier: str) -> dict[str, Any]:
    """Return capability snapshot for ``tier`` (defaults to Free)."""
    normalized = (tier or "free").lower()
    return _PLAN_CAPABILITIES.get(normalized, _PLAN_CAPABILITIES.get("free", _DEFAULT_CAPABILITIES["free"]))
