"""Slash commands for managing per-guild playback profiles."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING, Any

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

from src.services.profile_service import GuildProfileManager
from src.utils.embeds import EmbedFactory

if TYPE_CHECKING:
    from src.services.profile_service import GuildProfile


def _manager(bot: Any) -> GuildProfileManager:
    manager = getattr(bot, "profile_manager", None)
    if not manager:
        raise RuntimeError("GuildProfileManager not initialised on bot.")
    return manager


class ProfileCommands(commands.Cog):
    """Expose guild-level configuration toggles for playback behaviour."""

    def __init__(self, bot: commands.Bot):
        from typing import cast, Any
        from src.main import VectoBeat
        self.bot: VectoBeat = cast(Any, bot)

    profile = app_commands.Group(
        name="profile",
        description="Inspect and configure the guild playback profile.",
        guild_only=True,
    )

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _ensure_manage_guild(inter: discord.Interaction) -> Optional[str]:
        """Verify the invoker has manage_guild permissions."""
        if not inter.guild:
            return "This command can only be used inside a guild."
        member = inter.guild.get_member(inter.user.id) if isinstance(inter.user, discord.User) else inter.user
        if not isinstance(member, discord.Member):
            return "Unable to resolve invoking member."
        if not member.guild_permissions.manage_guild:
            return "You require the `Manage Server` permission to modify playback profiles."
        return None

    async def _push_bot_defaults(self, user_id: int, defaults: dict[str, int | bool | str]) -> None:
        """Synchronise bot defaults back to the control panel."""
        settings_service = getattr(self.bot, "server_settings", None)
        if not settings_service or not getattr(settings_service, "config", None):
            return
        base_url = getattr(settings_service.config, "base_url", None)
        api_key = getattr(settings_service.config, "api_key", None)
        if not base_url or not api_key:
            return
        url = f"{base_url.rstrip('/')}/api/account/bot-settings"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"discordId": str(user_id), **defaults}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.put(url, json=payload, headers=headers) as resp:
                        bot_logger = getattr(self.bot, "logger", None)
                        if bot_logger:
                            body = (await resp.text())[:200]
                            bot_logger.warning("Bot defaults sync failed (%s): %s", resp.status, body)
        except Exception as exc:  # pragma: no cover - defensive best-effort
            bot_logger = getattr(self.bot, "logger", None)
            if bot_logger:
                bot_logger.debug("Bot defaults sync error: %s", exc)

    @staticmethod
    def _profile_embed(inter: discord.Interaction, profile: GuildProfile) -> discord.Embed:
        """Build a concise embed representing the guild profile."""
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        embed = factory.primary("Playback Profile")
        embed.add_field(name="Default Volume", value=f"`{profile.default_volume}%`", inline=True)
        embed.add_field(name="Autoplay", value="✅ Enabled" if profile.autoplay else "❌ Disabled", inline=True)
        embed.add_field(name="Announcement Style", value=f"`{profile.announcement_style}`", inline=True)
        embed.add_field(name="Adaptive Mastering", value="✅ Enabled" if profile.adaptive_mastering else "❌ Disabled", inline=True)
        embed.add_field(name="Compliance Mode", value="✅ Enabled" if profile.compliance_mode else "❌ Disabled", inline=True)
        embed.set_footer(text="Use /profile commands to adjust these defaults.")
        return embed

    # ------------------------------------------------------------------ slash commands
    @profile.command(name="show", description="Display the current playback profile for this guild.")
    async def show(self, inter: discord.Interaction) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        profile = _manager(self.bot).get(inter.guild.id)  # type: ignore[union-attr]
        await inter.response.send_message(embed=self._profile_embed(inter, profile), ephemeral=True)

    @profile.command(name="set-volume", description="Set the default playback volume for this guild.")
    @app_commands.describe(level="Volume percent to apply automatically (0-200).")
    async def set_volume(self, inter: discord.Interaction, level: app_commands.Range[int, 0, 200]) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        manager = _manager(self.bot)
        profile = await manager.update(inter.guild.id, default_volume=level)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            await player.set_volume(profile.default_volume)

        # Push the new default back to the control panel so UI stays in sync.
        await self._push_bot_defaults(inter.user.id, {"defaultVolume": profile.default_volume})

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )

    @profile.command(name="set-autoplay", description="Enable or disable autoplay when the queue finishes.")
    async def set_autoplay(self, inter: discord.Interaction, enabled: bool) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        if enabled:
            service = getattr(self.bot, "server_settings", None)
            if service and not await service.allows_ai_recommendations(inter.guild.id):
                factory = EmbedFactory(inter.guild.id if inter.guild else None)
                warning = factory.warning(
                    "Autoplay requires the Pro plan. Upgrade via the control panel to enable AI recommendations."
                )
                await inter.response.send_message(embed=warning, ephemeral=True)
                return
        manager = _manager(self.bot)
        profile = await manager.update(inter.guild.id, autoplay=enabled)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            player.store("autoplay_enabled", profile.autoplay)

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )

    @profile.command(name="set-announcement", description="Choose how now-playing messages are displayed.")
    @app_commands.describe(style="Select between rich embeds or minimal text notifications.")
    @app_commands.choices(
        style=[
            app_commands.Choice(name="Rich Embed", value="rich"),
            app_commands.Choice(name="Minimal Text", value="minimal"),
        ]
    )
    async def set_announcement(self, inter: discord.Interaction, style: app_commands.Choice[str]) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        manager = _manager(self.bot)
        profile = await manager.update(inter.guild.id, announcement_style=style.value)  # type: ignore[union-attr]

        player = self.bot.lavalink.player_manager.get(inter.guild.id)  # type: ignore[union-attr]
        if player:
            player.store("announcement_style", profile.announcement_style)

        await inter.response.send_message(
            embed=self._profile_embed(inter, profile),
            ephemeral=True,
        )

    @profile.command(name="set-mastering", description="Enable or disable adaptive mastering (loudness normalization).")
    async def set_mastering(self, inter: discord.Interaction, enabled: bool) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        manager = _manager(self.bot)
        profile = await manager.update(inter.guild.id, adaptive_mastering=enabled)

        player = self.bot.lavalink.player_manager.get(inter.guild.id)
        if player:
            cog = self.bot.get_cog("MusicEvents")
            if cog and hasattr(cog, "_apply_adaptive_mastering"):
                from typing import cast, Any
                await cast(Any, cog)._apply_adaptive_mastering(player)

        await inter.response.send_message(embed=self._profile_embed(inter, profile), ephemeral=True)

    @profile.command(name="set-compliance", description="Enable compliance mode (export-ready safety logs).")
    async def set_compliance(self, inter: discord.Interaction, enabled: bool) -> None:
        if not inter.guild:
            await inter.response.send_message("This command can only be used inside a guild.", ephemeral=True)
            return
        if (error := self._ensure_manage_guild(inter)) is not None:
            await inter.response.send_message(error, ephemeral=True)
            return
        manager = _manager(self.bot)
        profile = await manager.update(inter.guild.id, compliance_mode=enabled)
        await inter.response.send_message(embed=self._profile_embed(inter, profile), ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(ProfileCommands(bot))
