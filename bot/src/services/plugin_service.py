"""Service for managing optional feature modules (plugins)."""

from __future__ import annotations

from typing import Set

from src.services.server_settings_service import ServerSettingsService


class PluginService:
    """Manages availability of optional plugins per guild."""

    def __init__(self, settings: ServerSettingsService) -> None:
        self.settings = settings
        self._known_plugins = {
            "advanced_analytics",
            "automation_smart",
            "automation_full",
            "white_label",
            "custom_branding",
            "priority_care",
            "compliance_export",
        }

    async def get_enabled_plugins(self, guild_id: int) -> Set[str]:
        """Return a set of enabled plugin keys for the guild."""
        # This aggregates capabilities from tier + addons
        state = await self.settings.get_settings(guild_id)
        enabled = set()
        
        # Map existing settings to "plugins"
        tier = state.tier or "free"
        if tier in ("growth", "scale", "enterprise"):
            enabled.add("advanced_analytics")
            enabled.add("compliance_export")
        
        automation = str(state.settings.get("automationLevel") or "off")
        if automation == "smart":
            enabled.add("automation_smart")
        elif automation == "full":
            enabled.add("automation_smart")
            enabled.add("automation_full")
            
        if state.settings.get("whiteLabelBranding"):
            enabled.add("white_label")
            enabled.add("custom_branding")
            
        if state.settings.get("priorityCare"):
            enabled.add("priority_care")
            
        return enabled

    async def has_plugin(self, guild_id: int, plugin: str) -> bool:
        """Check if a specific plugin is enabled for the guild."""
        enabled = await self.get_enabled_plugins(guild_id)
        return plugin in enabled

    async def list_available_plugins(self, guild_id: int) -> Set[str]:
        """Return all plugins that COULD be enabled for this guild (e.g. via upgrade)."""
        # For now, just return all known plugins
        return self._known_plugins
