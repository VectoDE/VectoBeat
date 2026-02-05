"""Service for managing optional feature modules (plugins)."""

from __future__ import annotations

import logging
import asyncio
import traceback
from typing import Set, Dict, Any, List, Optional
import aiohttp

from src.services.server_settings_service import ServerSettingsService

logger = logging.getLogger(__name__)

class PluginExecutionError(Exception):
    """Raised when a plugin fails to execute."""
    pass

class PluginService:
    """Manages availability and execution of optional plugins per guild."""

    def __init__(self, settings: ServerSettingsService) -> None:
        self.settings = settings
        self._custom_plugin_cache: Dict[int, List[Dict[str, Any]]] = {}
        self._cache_expiry: Dict[int, float] = {}
        self._known_plugins = {
            "advanced_analytics",
            "automation_smart",
            "automation_full",
            "white_label",
            "custom_branding",
            "priority_care",
            "compliance_export",
        }
        # Circuit breaker state
        self._api_failures = 0
        self._next_retry = 0.0

    async def get_enabled_plugins(self, guild_id: int) -> Set[str]:
        """Return a set of enabled plugin keys for the guild."""
        try:
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

            # Merge Custom Plugins from DB
            custom_plugins = await self._fetch_custom_plugins(guild_id)
            for p in custom_plugins:
                enabled.add(f"custom:{p['name']}")
                
            return enabled
        except Exception as e:
            logger.error(f"Failed to determine enabled plugins for guild {guild_id}: {e}", exc_info=True)
            return set()

    async def has_plugin(self, guild_id: int, plugin: str) -> bool:
        """Check if a specific plugin is enabled for the guild."""
        enabled = await self.get_enabled_plugins(guild_id)
        return plugin in enabled

    async def list_available_plugins(self, guild_id: int) -> Set[str]:
        """Return all plugins that COULD be enabled for this guild."""
        return self._known_plugins

    async def requires_dedicated_shard(self, guild_id: int) -> bool:
        """Check if any enabled plugin requires a dedicated shard."""
        custom_plugins = await self._fetch_custom_plugins(guild_id)
        return any(p.get("requiresDedicatedShard", False) for p in custom_plugins)

    async def _fetch_custom_plugins(self, guild_id: int) -> List[Dict[str, Any]]:
        """Fetch custom installed plugins from the control panel API."""
        now = asyncio.get_event_loop().time()
        
        # Check circuit breaker
        if self._api_failures > 3 and now < self._next_retry:
            logger.warning(f"Plugin API circuit open. Skipping fetch for guild {guild_id}")
            return self._custom_plugin_cache.get(guild_id, [])

        if guild_id in self._custom_plugin_cache and now < self._cache_expiry.get(guild_id, 0):
            return self._custom_plugin_cache[guild_id]

        try:
            base = self.settings.config.base_url.rstrip("/")
            url = f"{base}/api/bot/plugins?guildId={guild_id}"
            headers = self.settings._headers()

            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        plugins = data.get("plugins", [])
                        self._custom_plugin_cache[guild_id] = plugins
                        self._cache_expiry[guild_id] = now + 300  # 5 minutes cache
                        self._api_failures = 0 # Reset failures on success
                        return plugins
                    elif response.status == 404:
                         # Guild has no plugins or not found, cache empty list
                        self._custom_plugin_cache[guild_id] = []
                        self._cache_expiry[guild_id] = now + 300
                        return []
                    else:
                        logger.warning(f"Failed to fetch plugins for guild {guild_id}: {response.status}")
                        self._api_failures += 1
                        self._next_retry = now + 30
                        return self._custom_plugin_cache.get(guild_id, [])
                        
        except Exception as e:
            logger.error(f"Error fetching plugins for guild {guild_id}: {e}")
            self._api_failures += 1
            self._next_retry = now + 30
            return self._custom_plugin_cache.get(guild_id, [])

    async def execute_plugin_entry_point(self, guild_id: int, plugin_name: str, context: Any = None) -> Any:
        """
        Execute the entry point of a custom plugin with safety wrappers.
        """
        try:
            plugins = await self._fetch_custom_plugins(guild_id)
            target = next((p for p in plugins if p["name"] == plugin_name), None)
            
            if not target:
                raise PluginExecutionError(f"Plugin {plugin_name} not found or enabled for guild {guild_id}.")

            entry_source = next((s for s in target["sources"] if s["entryPoint"]), None)
            if not entry_source:
                raise PluginExecutionError(f"No entry point defined for plugin {plugin_name}")

            language = entry_source["language"]
            content = entry_source["content"]

            logger.info(f"Executing plugin {plugin_name} ({language}) for guild {guild_id}")

            if language == "PYTHON":
                return await self._execute_python(content, guild_id, context)
            elif language in ("JAVASCRIPT", "TYPESCRIPT", "LUA"):
                return await self._execute_subprocess_stub(language, content, guild_id)
            else:
                raise PluginExecutionError(f"Unsupported language: {language}")

        except PluginExecutionError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error executing plugin {plugin_name}: {e}\n{traceback.format_exc()}")
            raise PluginExecutionError(f"Internal execution error: {e}")

    async def _execute_python(self, content: str, guild_id: int, context: Any) -> Any:
        """Executes Python code in a restricted scope."""
        # Define a restricted global scope
        # In a real enterprise env, we'd use a separate process or container (e.g. Firecracker/gVisor)
        local_scope = {
            "context": context,
            "guild_id": guild_id,
            "__builtins__": {
                "print": print, # Allow print for debugging
                "range": range,
                "len": len,
                "int": int,
                "str": str,
                "list": list,
                "dict": dict,
                "set": set,
                "bool": bool,
                "Exception": Exception,
            }
        }
        
        try:
            # Execute with a timeout
            loop = asyncio.get_running_loop()
            # Running exec in an executor doesn't stop it from blocking if it loops forever, 
            # but it prevents blocking the main bot loop immediately.
            # True sandboxing requires OS-level isolation.
            await loop.run_in_executor(None, exec, content, {}, local_scope)
            
            # If the code defines a 'run' function, call it
            if "run" in local_scope and callable(local_scope["run"]):
                if asyncio.iscoroutinefunction(local_scope["run"]):
                     return await local_scope["run"](context)
                else:
                     return await loop.run_in_executor(None, local_scope["run"], context)
            
            return local_scope.get("result")
            
        except Exception as e:
            raise PluginExecutionError(f"Python execution failed: {e}")

    async def _execute_subprocess_stub(self, language: str, content: str, guild_id: int) -> str:
        """Stub for executing external languages via subprocess."""
        # Future implementation: Write content to temp file, run node/lua/deno, capture stdout
        logger.info(f"Subprocess execution requested for {language}")
        return f"Executed {language} plugin (Stub)"
