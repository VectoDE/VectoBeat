"""Utility helpers for sensitive command scopes."""

from __future__ import annotations

from typing import Any, Dict, Optional

import discord

from src.configs.settings import CONFIG


class SensitiveScope:
    SUCCESS_POD = "success_pod"
    CONCIERGE = "concierge"
    COMPLIANCE_EXPORT = "compliance_export"


def _scope_ids(scope: str) -> list[int]:
    mapping = {
        SensitiveScope.SUCCESS_POD: CONFIG.security.success_pod_staff_ids,
        SensitiveScope.CONCIERGE: CONFIG.security.concierge_staff_ids,
        SensitiveScope.COMPLIANCE_EXPORT: CONFIG.security.compliance_export_admin_ids,
    }
    return mapping.get(scope, [])


def has_scope(user: discord.abc.User | discord.Member | None, scope: str) -> bool:
    """Return True if ``user`` is in the configured allow-list for ``scope``."""
    if user is None:
        return False
    ids = _scope_ids(scope)
    if ids:
        return user.id in ids
    if isinstance(user, discord.Member):
        return user.guild_permissions.administrator
    return False


def log_sensitive_action(
    bot: Any,
    *,
    scope: str,
    action: str,
    guild: Optional[discord.Guild],
    user: Optional[discord.abc.User],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Emit a structured log entry for privileged operations."""
    logger = getattr(bot, "logger", None)
    if not logger:
        return
    guild_id = getattr(guild, "id", None)
    user_id = getattr(user, "id", None)
    logger.info(
        "[Sensitive] scope=%s action=%s guild=%s user=%s metadata=%s",
        scope,
        action,
        guild_id,
        user_id,
        metadata or {},
    )
