"""Slash commands to surface membership status and start Stripe checkout from Discord."""

from __future__ import annotations

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

from src.configs.settings import CONFIG
from src.services.server_settings_service import ServerSettingsService
from src.utils.embeds import EmbedFactory
from src.utils.plan_capabilities import get_plan_capabilities


def _settings(bot: commands.Bot) -> ServerSettingsService:
    service = getattr(bot, "server_settings", None)
    if not service:
        raise RuntimeError("ServerSettingsService not initialised on bot.")
    return service


class MembershipCommands(commands.Cog):
    """Expose membership visibility + checkout flows directly in Discord."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self._api_base = (CONFIG.control_panel_api.base_url or "http://127.0.0.1:3000").rstrip("/")
        timeout = max(6, CONFIG.control_panel_api.timeout_seconds)
        self._http_timeout = aiohttp.ClientTimeout(total=timeout)
        self._http_session: aiohttp.ClientSession | None = None

    async def _session(self) -> aiohttp.ClientSession:
        """Reuse a single HTTP session to avoid connection setup overhead."""
        if self._http_session is None or self._http_session.closed:
            self._http_session = aiohttp.ClientSession(timeout=self._http_timeout)
        return self._http_session

    async def cog_unload(self) -> None:
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
            self._http_session = None

    membership = app_commands.Group(
        name="membership",
        description="Show the current plan and launch Stripe checkout from Discord.",
        guild_only=True,
    )

    async def _current_tier(self, guild_id: int) -> str:
        try:
            return await _settings(self.bot).tier(guild_id)
        except Exception:  # pragma: no cover - defensive fallback
            logger = getattr(self.bot, "logger", None)
            if logger:
                logger.warning("Unable to resolve tier for guild %s", guild_id)
            return "free"

    async def _create_checkout_link(
        self,
        *,
        guild_id: int,
        guild_name: str,
        tier: str,
        billing_cycle: str,
        email: str,
        requester_id: int,
        requester_name: str | None,
    ) -> str | None:
        url = f"{self._api_base}/api/checkout"
        payload = {
            "tierId": tier,
            "billingCycle": billing_cycle,
            "customerEmail": email,
            "discordId": str(requester_id),
            "guildId": str(guild_id),
            "guildName": guild_name,
            "customerName": requester_name or "",
            "successPath": "/success",
            "cancelPath": "/failed",
            "locale": "de",
        }
        headers = {"Content-Type": "application/json"}

        session = await self._session()
        async with session.post(url, json=payload, headers=headers) as resp:
            data = await resp.json()
            if not resp.ok:
                raise RuntimeError(data.get("error") or f"Checkout start failed ({resp.status}).")
            return data.get("url")

    @membership.command(name="status", description="Show the current plan for this server.")
    async def status(self, inter: discord.Interaction) -> None:
        if not inter.guild:
            await inter.response.send_message("This command only works inside a server.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True, thinking=True)

        tier = await self._current_tier(inter.guild.id)
        plan = get_plan_capabilities(tier)
        queue_cap = plan.get("limits", {}).get("queue")
        automation = plan.get("serverSettings", {}).get("maxAutomationLevel", "off")
        sources = plan.get("serverSettings", {}).get("maxSourceAccessLevel", "core")

        factory = EmbedFactory(inter.guild.id)
        embed = factory.primary("Guild membership")
        embed.add_field(name="Current plan", value=tier.capitalize(), inline=True)
        if queue_cap:
            embed.add_field(name="Queue limit", value=f"{queue_cap} tracks", inline=True)
        embed.add_field(name="Source access", value=str(sources).capitalize(), inline=True)
        embed.add_field(name="Automation", value=str(automation).capitalize(), inline=True)
        embed.description = (
            "Memberships are now visible directly in Discord. Use `/membership checkout` to open Stripe and purchase a plan for this server."
        )

        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Open dashboard", url=f"{self._api_base}/account"))
        view.add_item(discord.ui.Button(label="View pricing", url=f"{self._api_base}/pricing"))

        await inter.followup.send(embed=embed, view=view, ephemeral=True)

    @membership.command(name="checkout", description="Start a Stripe checkout for this server.")
    @app_commands.describe(
        tier="Which plan do you want to purchase?",
        billing_cycle="Billing interval for Stripe.",
        email="Billing email for Stripe (required).",
    )
    @app_commands.choices(
        tier=[
            app_commands.Choice(name="Starter", value="starter"),
            app_commands.Choice(name="Pro", value="pro"),
            app_commands.Choice(name="Growth", value="growth"),
            app_commands.Choice(name="Scale", value="scale"),
            app_commands.Choice(name="Enterprise", value="enterprise"),
        ],
        billing_cycle=[
            app_commands.Choice(name="Monthly", value="monthly"),
            app_commands.Choice(name="Yearly", value="yearly"),
        ],
    )
    async def checkout(
        self,
        inter: discord.Interaction,
        tier: app_commands.Choice[str],
        billing_cycle: app_commands.Choice[str],
        email: str,
    ) -> None:
        if not inter.guild:
            await inter.response.send_message("Checkout only works inside a Discord server.", ephemeral=True)
            return
        if "@" not in email or "." not in email:
            await inter.response.send_message("Please provide a valid billing email for Stripe.", ephemeral=True)
            return

        await inter.response.defer(ephemeral=True, thinking=True)
        checkout_url = None
        try:
            checkout_url = await self._create_checkout_link(
                guild_id=inter.guild.id,
                guild_name=inter.guild.name,
                tier=tier.value,
                billing_cycle=billing_cycle.value,
                email=email.strip(),
                requester_id=inter.user.id,
                requester_name=getattr(inter.user, "global_name", None) or inter.user.display_name,
            )
        except Exception as exc:
            await inter.followup.send(
                f"Stripe checkout could not start: {exc}", ephemeral=True
            )

        if not checkout_url:
            await inter.followup.send(
                "Stripe did not return a link. Please try again or use the dashboard.",
                ephemeral=True,
            )

        embed = EmbedFactory(inter.guild.id).primary("Stripe checkout ready")
        embed.description = (
            f"{tier.name} ({billing_cycle.name}) is prepared for **{inter.guild.name}**. "
            "Open the link below to finish purchasing the membership."
        )
        embed.add_field(name="Billing email", value=email, inline=True)

        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Open Stripe", url=checkout_url))
        view.add_item(discord.ui.Button(label="Control panel", url=f"{self._api_base}/account"))

        await inter.followup.send(embed=embed, view=view, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(MembershipCommands(bot))
