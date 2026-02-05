"""Reusable view for paginating lists of strings in embeds."""

import math
import discord
from typing import List, Optional
from .embeds import EmbedFactory


class EmbedPaginator(discord.ui.View):
    def __init__(self, entries: List[str], per_page: int = 10, guild_id: Optional[int] = None, timeout: float = 60.0) -> None:
        """Create a pagination view for the provided entries."""
        super().__init__(timeout=timeout)
        self.entries = entries
        self.per_page = per_page
        self.page = 1
        self.pages = max(math.ceil(len(entries) / per_page), 1)
        self.factory = EmbedFactory(guild_id)

        if self.pages == 1:
            for child in self.children:
                if isinstance(child, discord.ui.Button):
                    child.disabled = True

    def _slice(self) -> List[str]:
        """Return the current window of entries formatted for display."""
        start = (self.page - 1) * self.per_page
        end = start + self.per_page
        items = self.entries[start:end]
        numbered = [f"`{i+1+start}.` {it}" for i, it in enumerate(items)]
        return numbered

    def make_embed(self) -> discord.Embed:
        """Build the embed for the current page."""
        return self.factory.queue_page(items=self._slice(), page=self.page, pages=self.pages)

    @discord.ui.button(label="⏮", style=discord.ButtonStyle.secondary)
    async def first(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        self.page = 1
        await interaction.response.edit_message(embed=self.make_embed(), view=self)

    @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary)
    async def prev(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if self.page > 1:
            self.page -= 1
        await interaction.response.edit_message(embed=self.make_embed(), view=self)

    @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary)
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if self.page < self.pages:
            self.page += 1
        await interaction.response.edit_message(embed=self.make_embed(), view=self)

    @discord.ui.button(label="⏭", style=discord.ButtonStyle.secondary)
    async def last(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        self.page = self.pages
        await interaction.response.edit_message(embed=self.make_embed(), view=self)
