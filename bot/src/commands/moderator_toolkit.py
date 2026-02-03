"""Moderator toolkit commands for quick-response macros and badges."""

from __future__ import annotations

from typing import TypedDict, List
import discord
from discord import app_commands
from discord.ext import commands

class Macro(TypedDict):
    id: str
    label: str
    body: str

MODERATOR_MACROS: List[Macro] = [
    {
        "id": "ack_incident",
        "label": "Incident acknowledgment",
        "body": "Thanks for the report. We're routing this to ops. Please share shard ID, guild ID, and the last command that failed.",
    },
    {
        "id": "queue_cleanup",
        "label": "Queue hygiene",
        "body": "Queue Copilots are enabled to dedupe and smooth loudness. If spikes continue, send 2–3 track links so we can tune the preset.",
    },
    {
        "id": "status_check",
        "label": "Status check",
        "body": "We aren't seeing errors on our side. Please run /voiceinfo and /lavalink and paste latency + queue length. We'll keep this thread open until stable.",
    },
]

BADGES = [
    ("Incident Responder", "Handled 3+ incident retros."),
    ("Playbook Author", "Published a forum playbook."),
    ("Moderator Lead", "Active moderator with Pro+ guild access."),
]


class ModeratorToolkit(commands.Cog):
    """Macros and badges to speed up moderator responses."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @staticmethod
    def _is_moderator(member: discord.Member | None) -> bool:
        if not member:
            return False
        perms = member.guild_permissions
        return perms.manage_messages or perms.manage_guild or perms.administrator

    @app_commands.command(name="macro", description="Insert a moderator macro (private by default).")
    @app_commands.describe(macro="Pick a macro", post_public="Send to the channel instead of privately copying it.")
    async def macro(self, inter: discord.Interaction, macro: str, post_public: bool = False) -> None:
        if not isinstance(inter.user, discord.Member) or not self._is_moderator(inter.user):
            return await inter.response.send_message("Moderator permissions required.", ephemeral=True)

        macro_def = next((item for item in MODERATOR_MACROS if item["id"] == macro), None)
        if not macro_def:
            return await inter.response.send_message("Unknown macro.", ephemeral=True)

        content = macro_def["body"]
        if post_public:
            await inter.response.send_message(content, ephemeral=False)
        else:
            await inter.response.send_message(f"Copied macro:\n{content}", ephemeral=True)

    @macro.autocomplete("macro")
    async def macro_autocomplete(self, _: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
        current_lower = current.lower()
        matches = [
            app_commands.Choice(name=macro["label"], value=macro["id"])
            for macro in MODERATOR_MACROS
            if current_lower in macro["label"].lower() or current_lower in macro["id"]
        ]
        return matches[:10]

    @app_commands.command(name="badges", description="List available moderator badges.")
    async def badges(self, inter: discord.Interaction) -> None:
        if not isinstance(inter.user, discord.Member) or not self._is_moderator(inter.user):
            return await inter.response.send_message("Moderator permissions required.", ephemeral=True)

        lines = [f"• **{name}** — {desc}" for name, desc in BADGES]
        await inter.response.send_message(
          "Moderator badges (alpha):\n" + "\n".join(lines),
          ephemeral=True,
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(ModeratorToolkit(bot))
