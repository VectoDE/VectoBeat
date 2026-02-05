"""Role-based DJ permission management with lightweight auditing."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
import discord


@dataclass
class DJGuildConfig:
    """Persisted DJ role information per guild."""

    roles: List[int] = field(default_factory=list)
    audit: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {"roles": self.roles, "audit": self.audit}


class DJPermissionManager:
    """Store DJ roles per guild and keep a short action history."""

    def __init__(self, path: str | Path = "data/dj_permissions.json", *, max_audit: int = 50) -> None:
        self.path = Path(path)
        self.max_audit = max_audit
        self._configs: Dict[str, DJGuildConfig] = {}
        self._background_tasks = set()

    # ------------------------------------------------------------------ persistence
    async def start(self) -> None:
        """Initialize the service and load persisted data."""
        await self.load()

    async def load(self) -> None:
        if not self.path.exists():
            return
        try:
            async with aiofiles.open(self.path, "r", encoding="utf-8") as f:
                content = await f.read()
            raw = json.loads(content)
        except (json.JSONDecodeError, OSError):
            raw = {}
        for guild_id, payload in raw.items():
            roles = [int(role) for role in payload.get("roles", [])]
            audit = payload.get("audit", [])[-self.max_audit:]
            self._configs[guild_id] = DJGuildConfig(roles=roles, audit=audit)

    async def save(self) -> None:
        if not self.path.parent.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
        serialised = {
            guild_id: config.to_dict() for guild_id, config in self._configs.items()
        }
        try:
            async with aiofiles.open(self.path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(serialised, indent=2, sort_keys=True))
        except OSError:
            pass

    # ------------------------------------------------------------------ helpers
    def _key(self, guild_id: int) -> str:
        return str(guild_id)

    def config(self, guild_id: int) -> DJGuildConfig:
        key = self._key(guild_id)
        if key not in self._configs:
            self._configs[key] = DJGuildConfig()
        config = self._configs[key]
        if len(config.audit) > self.max_audit:
            config.audit = config.audit[-self.max_audit:]
        return config

    # ------------------------------------------------------------------ role management
    def get_roles(self, guild_id: int) -> List[int]:
        return list(self.config(guild_id).roles)

    async def set_roles(self, guild_id: int, role_ids: List[int]) -> DJGuildConfig:
        config = self.config(guild_id)
        config.roles = sorted(set(int(rid) for rid in role_ids))
        await self.save()
        return config

    async def add_role(self, guild_id: int, role_id: int) -> DJGuildConfig:
        config = self.config(guild_id)
        if role_id not in config.roles:
            config.roles.append(role_id)
            config.roles.sort()
            await self.save()
        return config

    async def remove_role(self, guild_id: int, role_id: int) -> DJGuildConfig:
        config = self.config(guild_id)
        if role_id in config.roles:
            config.roles.remove(role_id)
            await self.save()
        return config

    def has_restrictions(self, guild_id: int) -> bool:
        return bool(self.config(guild_id).roles)

    def has_access(self, guild_id: int, member: discord.Member) -> bool:
        """Return True if ``member`` can manage the queue in ``guild_id``."""
        if member.guild_permissions.manage_guild or member.guild_permissions.administrator:
            return True
        config = self.config(guild_id)
        if not config.roles:
            return True
        member_role_ids = {role.id for role in getattr(member, "roles", [])}
        return any(role_id in member_role_ids for role_id in config.roles)

    async def record_action(
        self,
        guild_id: int,
        user: discord.abc.User,
        action: str,
        *,
        details: Optional[str] = None,
    ) -> None:
        """Record a queue control action for auditing."""
        config = self.config(guild_id)
        entry = {
            "ts": int(datetime.now(timezone.utc).timestamp()),
            "user_id": getattr(user, "id", 0),
            "action": action,
            "details": details or "",
        }
        config.audit.append(entry)
        config.audit = config.audit[-self.max_audit:]
        # Use asyncio.create_task to save in background to avoid blocking
        task = asyncio.create_task(self.save())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def recent_actions(self, guild_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        config = self.config(guild_id)
        return config.audit[-limit:]
