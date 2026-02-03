"""Slash commands for coordinating the Scale success pod lifecycle."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional, TYPE_CHECKING

import discord
from discord import app_commands
from discord.ext import commands

from src.utils.embeds import EmbedFactory
from src.utils.security import SensitiveScope, has_scope, log_sensitive_action

if TYPE_CHECKING:
    from src.services.success_pod_service import SuccessPodService
    from src.services.scale_contact_service import ScaleContactService


def _service(bot: commands.Bot) -> SuccessPodService:
    svc = getattr(bot, "success_pod", None)
    if not svc:
        raise RuntimeError("Success pod service not configured.")
    return svc


def _contact_service(bot: commands.Bot) -> ScaleContactService:
    svc = getattr(bot, "scale_contacts", None)
    if not svc:
        raise RuntimeError("Scale contact service not configured.")
    return svc


def _status_label(value: Optional[str]) -> str:
    mapping = {
        "acknowledged": "Acknowledged",
        "scheduled": "Scheduled",
        "resolved": "Resolved",
        "submitted": "Submitted",
    }
    return mapping.get((value or "").lower(), "Submitted")


def _format_timestamp(value: Optional[str]) -> str:
    if not value:
        return "pending"
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.strftime("%b %d %H:%M")


class SuccessPodCommands(commands.Cog):
    """Expose commands for Scale customers + staff to track success pod work."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    success = app_commands.Group(
        name="success",
        description="Coordinate with your dedicated success pod",
        guild_only=True,
    )

    async def _ensure_scale(self, inter: discord.Interaction) -> bool:
        if not inter.guild:
            await inter.response.send_message("This command must be used in a server.", ephemeral=True)
            return False
        settings = getattr(self.bot, "server_settings", None)
        if not settings:
            return True
        try:
            tier = await settings.tier(inter.guild.id)
        except Exception:
            tier = "free"
        if tier.lower() != "scale":
            await inter.response.send_message(
                "Success pod access requires an active **Scale** plan.",
                ephemeral=True,
            )
            return False
        return True

    def _is_staff(self, inter: discord.Interaction) -> bool:
        return has_scope(inter.user, SensitiveScope.SUCCESS_POD)

    def _log_action(self, inter: discord.Interaction, action: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        log_sensitive_action(
            self.bot,
            scope=SensitiveScope.SUCCESS_POD,
            action=action,
            guild=inter.guild,
            user=inter.user,
            metadata=metadata,
        )

    @success.command(name="request", description="Submit a request to your success pod.")
    @app_commands.describe(
        contact="Email or handle your account manager can reach you at.",
        summary="Context, goals, and any deadlines.",
    )
    async def request(self, inter: discord.Interaction, contact: str, summary: str) -> None:
        if not await self._ensure_scale(inter):
            return
        service = _service(self.bot)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not getattr(service, "enabled", False):
            await inter.response.send_message(
                "Success pod integration is currently unavailable.",
                ephemeral=True,
            )
            return
        await inter.response.defer(ephemeral=True)
        result = await service.create_request(
            inter.guild.id if inter.guild else 0,
            guild_name=inter.guild.name if inter.guild else None,
            contact=contact,
            summary=summary,
            actor_id=inter.user.id if inter.user else None,
            actor_name=str(inter.user) if inter.user else None,
        )
        if not result:
            await inter.followup.send(
                "Unable to submit your success pod request right now.",
                ephemeral=True,
            )
            return
        embed = factory.success(
            "Success pod engaged",
            f"Tracking ID: `{result.get('id')}`. Your pod will reach out shortly.",
        )
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(
            inter,
            action="request",
            metadata={"contact": contact, "summaryLength": len(summary or "")},
        )

    @success.command(name="status", description="Review recent success pod lifecycle updates.")
    async def status(self, inter: discord.Interaction) -> None:
        if not await self._ensure_scale(inter):
            return
        service = _service(self.bot)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not getattr(service, "enabled", False):
            await inter.response.send_message(
                "Success pod integration is currently unavailable.",
                ephemeral=True,
            )
            return
        await inter.response.defer(ephemeral=True)
        requests = await service.fetch_requests(inter.guild.id if inter.guild else 0, limit=3)
        embed = factory.primary("Success pod lifecycle")
        if not requests:
            embed.description = "No success pod requests found. Use `/success request` to submit one."
            await inter.followup.send(embed=embed, ephemeral=True)
            self._log_action(inter, action="status_empty")
            return
        for request in requests[:2]:
            summary = str(request.get("summary") or "Request")
            summary_label = summary if len(summary) <= 80 else f"{summary[:77]}…"
            status_label = _status_label(request.get("status"))
            timeline = request.get("timeline") or []
            lines = []
            for entry in timeline[-4:]:
                label = _status_label(entry.get("kind"))
                when = _format_timestamp(entry.get("createdAt"))
                note = (entry.get("note") or "").strip()
                if note and len(note) > 80:
                    note = f"{note[:77]}…"
                actor = entry.get("actor")
                suffix = f" · {actor}" if actor else ""
                if note:
                    lines.append(f"`{when}` — **{label}** {note}{suffix}")
                else:
                    lines.append(f"`{when}` — **{label}**{suffix}")
            if request.get("assignedTo"):
                lines.append(f"Assigned to **{request.get('assignedTo')}**")
            if request.get("scheduledFor"):
                lines.append(f"Next session: `{_format_timestamp(request.get('scheduledFor'))}`")
            field_value = "\n".join(lines) or "Timeline pending."
            block = f"ID: `{request.get('id')}`\n{field_value}"
            embed.add_field(
                name=f"{status_label} — {summary_label}",
                value=block[:1024],
                inline=False,
            )
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(inter, action="status_view", metadata={"count": len(requests)})

    @success.command(name="contact", description="Show your account manager and escalation path.")
    async def contact(self, inter: discord.Interaction) -> None:
        if not await self._ensure_scale(inter):
            return
        service = _contact_service(self.bot)
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Scale contact integration unavailable.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        contact = await service.fetch_contact(inter.guild.id if inter.guild else 0)
        if not contact:
            embed = factory.warning(
                "Escalation pending",
                "Ops have not assigned an account manager yet. The success pod will update this shortly.",
            )
            await inter.followup.send(embed=embed, ephemeral=True)
            self._log_action(inter, action="contact_missing")
            return
        lines = []
        if contact.get("managerName"):
            lines.append(f"Manager: **{contact['managerName']}**")
        if contact.get("managerEmail"):
            lines.append(f"Email: `{contact['managerEmail']}`")
        if contact.get("managerDiscord"):
            lines.append(f"Discord: `{contact['managerDiscord']}`")
        if contact.get("escalationChannel"):
            lines.append(f"Escalation channel: {contact['escalationChannel']}")
        if contact.get("escalationNotes"):
            lines.append(contact["escalationNotes"])
        description = "\n".join(lines) or "Your account team will reach out with contact information."
        embed = factory.primary("Account manager", description[:4000])
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(inter, action="contact_view")

    @success.command(name="acknowledge", description="(Staff) acknowledge a success pod request.")
    @app_commands.describe(
        request_id="Request identifier (see /success status).",
        note="Optional note shown to the customer.",
        assigned_to="Name of the success pod owner.",
        assigned_contact="Contact method (email, Discord).",
    )
    async def acknowledge(
        self,
        inter: discord.Interaction,
        request_id: str,
        note: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_contact: Optional[str] = None,
    ) -> None:
        if not self._is_staff(inter):
            await inter.response.send_message("Success pod staff privileges required.", ephemeral=True)
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Success pod integration disabled.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        result = await service.acknowledge_request(
            inter.guild.id if inter.guild else 0,
            request_id,
            actor_id=inter.user.id if inter.user else 0,
            actor_name=str(inter.user),
            note=note,
            assigned_to=assigned_to,
            assigned_contact=assigned_contact,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not result:
            await inter.followup.send("Unable to acknowledge that request.", ephemeral=True)
            return
        embed = factory.success("Request acknowledged", f"`{request_id}` is assigned to your pod.")
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(
            inter,
            action="acknowledge",
            metadata={"requestId": request_id, "assignedTo": assigned_to},
        )

    @success.command(name="schedule", description="(Staff) schedule a success pod session.")
    @app_commands.describe(
        request_id="Request identifier (see /success status).",
        scheduled_for="ISO 8601 timestamp, e.g. 2024-05-12T14:30Z",
        note="Optional customer-facing note.",
        assigned_to="Owner handling the session.",
        assigned_contact="Contact method for the assigned owner.",
    )
    async def schedule(
        self,
        inter: discord.Interaction,
        request_id: str,
        scheduled_for: str,
        note: Optional[str] = None,
        assigned_to: Optional[str] = None,
        assigned_contact: Optional[str] = None,
    ) -> None:
        if not self._is_staff(inter):
            await inter.response.send_message("Success pod staff privileges required.", ephemeral=True)
            return
        parsed = self._parse_iso_timestamp(scheduled_for)
        if not parsed:
            await inter.response.send_message(
                "Invalid timestamp. Use ISO format like `2024-05-12T14:30Z`.",
                ephemeral=True,
            )
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Success pod integration disabled.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        result = await service.schedule_request(
            inter.guild.id if inter.guild else 0,
            request_id,
            actor_id=inter.user.id if inter.user else 0,
            actor_name=str(inter.user),
            scheduled_for=parsed,
            note=note,
            assigned_to=assigned_to,
            assigned_contact=assigned_contact,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not result:
            await inter.followup.send("Unable to schedule that request.", ephemeral=True)
            return
        embed = factory.success(
            "Session scheduled",
            f"`{request_id}` scheduled for `{_format_timestamp(parsed)}`.",
        )
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(
            inter,
            action="schedule",
            metadata={"requestId": request_id, "scheduledFor": parsed, "assignedTo": assigned_to},
        )

    @success.command(name="resolve", description="(Staff) resolve a success pod request.")
    @app_commands.describe(
        request_id="Request identifier (see /success status).",
        note="Resolution summary for the customer.",
    )
    async def resolve(self, inter: discord.Interaction, request_id: str, note: str) -> None:
        if not self._is_staff(inter):
            await inter.response.send_message("Success pod staff privileges required.", ephemeral=True)
            return
        service = _service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Success pod integration disabled.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        result = await service.resolve_request(
            inter.guild.id if inter.guild else 0,
            request_id,
            actor_id=inter.user.id if inter.user else 0,
            actor_name=str(inter.user),
            note=note,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not result:
            await inter.followup.send("Unable to resolve that request.", ephemeral=True)
            return
        embed = factory.success("Request resolved", f"`{request_id}` marked as complete.")
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(
            inter,
            action="resolve",
            metadata={"requestId": request_id},
        )

    @success.command(name="set-contact", description="(Staff) update the account manager contact info.")
    @app_commands.describe(
        manager_name="Account manager name",
        manager_email="Preferred email",
        manager_discord="Discord handle or ID",
        escalation_channel="Public escalation channel/link",
        escalation_notes="Any special instructions for escalations",
    )
    async def set_contact(
        self,
        inter: discord.Interaction,
        manager_name: Optional[str] = None,
        manager_email: Optional[str] = None,
        manager_discord: Optional[str] = None,
        escalation_channel: Optional[str] = None,
        escalation_notes: Optional[str] = None,
    ) -> None:
        if not self._is_staff(inter):
            await inter.response.send_message("Success pod staff privileges required.", ephemeral=True)
            return
        service = _contact_service(self.bot)
        if not getattr(service, "enabled", False):
            await inter.response.send_message("Scale contact integration disabled.", ephemeral=True)
            return
        await inter.response.defer(ephemeral=True)
        contact = await service.update_contact(
            inter.guild.id if inter.guild else 0,
            manager_name=manager_name,
            manager_email=manager_email,
            manager_discord=manager_discord,
            escalation_channel=escalation_channel,
            escalation_notes=escalation_notes,
        )
        factory = EmbedFactory(inter.guild.id if inter.guild else None)
        if not contact:
            await inter.followup.send("Unable to update contact info.", ephemeral=True)
            return
        embed = factory.success("Account manager updated", "Customers will now see the refreshed contact details.")
        await inter.followup.send(embed=embed, ephemeral=True)
        self._log_action(
            inter,
            action="update_contact",
            metadata={
                "manager": manager_name,
                "email": manager_email,
            },
        )

    @staticmethod
    def _parse_iso_timestamp(raw: str) -> Optional[str]:
        raw = (raw or "").strip()
        if not raw:
            return None
        normalized = raw.replace(" ", "T")
        normalized = normalized.replace("t", "T")
        normalized = normalized.replace("z", "Z")
        try:
            parsed = dt.datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(SuccessPodCommands(bot))
