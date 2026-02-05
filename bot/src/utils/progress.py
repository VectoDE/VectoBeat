"""Helpers for surfacing progress updates in slash commands."""

from __future__ import annotations

from typing import Optional

import discord

from src.utils.embeds import EmbedFactory


class SlashProgress:
    """Manage a progress embed for long-running slash commands."""

    def __init__(
        self,
        interaction: discord.Interaction,
        title: str,
        *,
        ephemeral: bool = True,
    ) -> None:
        self.interaction: discord.Interaction = interaction
        self.title = title
        self.ephemeral = ephemeral
        self.message: Optional[discord.Message] = None
        guild_id = interaction.guild.id if interaction.guild else None
        self.factory = EmbedFactory(guild_id)

    async def start(self, description: str) -> None:
        """Send the initial progress message."""
        embed = self.factory.primary(self.title, description)
        self.message = await self.interaction.followup.send(embed=embed, ephemeral=self.ephemeral, wait=True)

    async def update(self, description: str) -> None:
        """Refresh the progress message with a new description."""
        if not self.message:
            return
        embed = self.factory.primary(self.title, description)
        try:
            await self.message.edit(embed=embed)
        except discord.HTTPException:
            pass

    async def finish(self, embed: discord.Embed) -> None:
        """Replace the progress message with the final embed."""
        if not self.message:
            await self.interaction.followup.send(embed=embed, ephemeral=self.ephemeral)
            return
        try:
            await self.message.edit(embed=embed)
        except discord.HTTPException:
            await self.interaction.followup.send(embed=embed, ephemeral=self.ephemeral)

    async def fail(self, description: str) -> None:
        """Display an error message and end the progress lifecycle."""
        embed = self.factory.error(description)
        await self.finish(embed)
