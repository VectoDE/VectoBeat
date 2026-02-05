"""Slash commands for configuring DJ permissions and viewing audit logs."""

from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from src.services.dj_permission_service import DJPermissionManager
from src.utils.embeds import EmbedFactory


def _manager(bot: commands.Bot) -> DJPermissionManager:
    manager = getattr(bot, "dj_permissions", None)
    if not manager:
        raise RuntimeError("DJPermissionManager not initialised on bot.")
    return manager


class DJCommands(commands.Cog):
    """Guild-level DJ role configuration and auditing helpers."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    dj = app_commands.Group(
        name="dj",
        description="Configure DJ roles and review queue-control history.",
        guild_only=True,
    )

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _ensure_manage_guild(inter: discord.Interaction) -> Optional[str]:
        if not inter.guild:
            return "This command can only be used inside a guild."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if not member.guild_permissions.manage_guild:
            return "You require the `Manage Server` permission to configure DJ roles."
        return None

    @staticmethod
    def _role_mentions(guild: discord.Guild, role_ids: list[int]) -> str:
        mentions = []
        for role_id in role_ids:
            role = guild.get_role(role_id)
            if role:
                mentions.append(role.mention)
        return ", ".join(mentions) if mentions else "`(missing roles)`"

    # ------------------------------------------------------------------ commands
    @dj.command(name="show", description="Display configured DJ roles and recent actions.")
    async def show(self, inter: discord.Interaction) -> None:
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not inter.guild:
            return await inter.response.send_message("Guild only command.", ephemeral=True)

        manager = _manager(self.bot)
        roles = manager.get_roles(inter.guild.id)
        embed = factory.primary("DJ Permissions")
        if roles:
            embed.add_field(name="Required Roles", value=self._role_mentions(inter.guild, roles), inline=False)
        else:
            embed.add_field(name="Required Roles", value="_None (anyone can manage the queue)_", inline=False)

        actions = manager.recent_actions(inter.guild.id, limit=5)
        if actions:
            lines = []
            for entry in actions:
                timestamp = entry.get("ts")
                user_id = entry.get("user_id")
                action = entry.get("action")
                details = entry.get("details")
                ts_fmt = f"<t:{timestamp}:R>" if timestamp else ""
                user_fmt = f"<@{user_id}>" if user_id else "`unknown`"
                detail_text = f" — {details}" if details else ""
                lines.append(f"{ts_fmt} {user_fmt} `{action}`{detail_text}")
            embed.add_field(name="Recent Actions", value="\n".join(lines), inline=False)
        else:
            embed.add_field(name="Recent Actions", value="_No actions recorded yet._", inline=False)

        await inter.response.send_message(embed=embed, ephemeral=True)

    @dj.command(name="add-role", description="Grant DJ permissions to a role.")
    async def add_role(self, inter: discord.Interaction, role: discord.Role) -> None:
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        assert inter.guild is not None

        manager = _manager(self.bot)
        await manager.add_role(inter.guild.id, role.id)
        await manager.record_action(
            inter.guild.id,
            inter.user,
            "config:add-role",
            details=f"Granted {role.name}",
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.success("DJ Role Added", f"{role.mention} can now control the queue.")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @dj.command(name="remove-role", description="Revoke DJ permissions from a role.")
    async def remove_role(self, inter: discord.Interaction, role: discord.Role) -> None:
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        assert inter.guild is not None

        manager = _manager(self.bot)
        await manager.remove_role(inter.guild.id, role.id)
        await manager.record_action(
            inter.guild.id,
            inter.user,
            "config:remove-role",
            details=f"Revoked {role.name}",
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.success("DJ Role Removed", f"{role.mention} can no longer control the queue.")
        await inter.response.send_message(embed=embed, ephemeral=True)

    @dj.command(name="clear", description="Allow anyone to control the queue by clearing DJ roles.")
    async def clear(self, inter: discord.Interaction) -> None:
        if (error := self._ensure_manage_guild(inter)) is not None:
            return await inter.response.send_message(error, ephemeral=True)
        assert inter.guild is not None

        manager = _manager(self.bot)
        await manager.set_roles(inter.guild.id, [])
        await manager.record_action(
            inter.guild.id,
            inter.user,
            "config:clear-roles",
            details="All DJ roles cleared",
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.warning("DJ Restrictions Cleared", "Anyone may manage the queue until roles are re-added.")
        await inter.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(DJCommands(bot))
