"""Helper utilities to load plan capability definitions shared across the stack."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

PLAN_CAPABILITIES_PATH = Path(__file__).resolve().parents[2] / "plan-capabilities.json"

try:
    with PLAN_CAPABILITIES_PATH.open("r", encoding="utf-8") as handle:
        _PLAN_CAPABILITIES: Dict[str, Dict[str, Any]] = json.load(handle)
except FileNotFoundError:
    _PLAN_CAPABILITIES = {
        "free": {
            "serverSettings": {
                "aiRecommendations": False,
                "maxAutomationLevel": "off",
                "maxAnalyticsMode": "basic",
                "allowedLavalinkRegions": ["auto"],
            }
        }
    }


@lru_cache(maxsize=None)
def get_plan_capabilities(tier: str) -> Dict[str, Any]:
    """Return capability snapshot for ``tier`` (defaults to Free)."""
    normalized = (tier or "free").lower()
    return _PLAN_CAPABILITIES.get(normalized, _PLAN_CAPABILITIES["free"])
