from __future__ import annotations

from collections import defaultdict
from typing import Iterable, List, Optional, Sequence, Tuple

import discord
from discord import app_commands
from discord.ext import commands


def _module_to_category(module: Optional[str]) -> str:
    if not module:
        return "General"
    if module.startswith("src.commands."):
        module = module[len("src.commands.") :]
    module = module.replace("_commands", "")
    return module.replace("_", " ").title() or "General"


class HelpPaginationView(discord.ui.View):
    def __init__(self, pages: Sequence[discord.Embed]):
        super().__init__(timeout=180)
        self.pages = list(pages)
        self.index = 0
        disabled = len(self.pages) <= 1
        self.previous_button.disabled = disabled
        self.next_button.disabled = disabled

    async def _update(self, interaction: discord.Interaction) -> None:
        embed = self.pages[self.index]
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="Previous", style=discord.ButtonStyle.secondary)
    async def previous_button(self, interaction: discord.Interaction, _: discord.ui.Button):
        if not self.pages:
            return
        self.index = (self.index - 1) % len(self.pages)
        await self._update(interaction)

    @discord.ui.button(label="Next", style=discord.ButtonStyle.secondary)
    async def next_button(self, interaction: discord.Interaction, _: discord.ui.Button):
        if not self.pages:
            return
        self.index = (self.index + 1) % len(self.pages)
        await self._update(interaction)

    async def on_timeout(self) -> None:
        for item in self.children:
            if isinstance(item, discord.ui.Button):
                item.disabled = True


class HelpCommands(commands.Cog):
    """Dynamic help command that introspects registered slash commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    def _flatten_command(
        self,
        command: app_commands.Command | app_commands.Group,
        parents: Optional[List[str]] = None,
    ) -> Iterable[Tuple[str, str, str]]:
        parents = parents or []
        if isinstance(command, app_commands.Group):
            for child in command.commands:
                yield from self._flatten_command(child, parents + [command.name])
            return

        full_name = "/" + " ".join(parents + [command.name])
        description = command.description or "No description provided."

        callback = getattr(command, "callback", None)
        module = getattr(callback, "__module__", None)
        category = _module_to_category(module)
        yield (category, full_name, description)

    def _build_pages(self) -> List[discord.Embed]:
        entries: list[Tuple[str, str, str]] = []
        for command in self.bot.tree.get_commands():
            entries.extend(self._flatten_command(command))

        grouped = defaultdict(list)
        for category, name, description in sorted(entries, key=lambda item: (item[0], item[1])):
            grouped[category].append((name, description))

        pages: List[discord.Embed] = []
        if not grouped:
            embed = discord.Embed(
                title="Help",
                description="No commands are currently registered.",
                color=discord.Color.blurple(),
            )
            pages.append(embed)
            return pages

        for category, commands_list in grouped.items():
            embed = discord.Embed(
                title=f"{category} Commands",
                description="Browse the available slash commands for this bot.",
                color=discord.Color.blurple(),
            )
            for name, description in commands_list:
                embed.add_field(name=name, value=description, inline=False)
            embed.set_footer(text=f"{len(commands_list)} command(s)")
            pages.append(embed)
        return pages

    @app_commands.command(name="help", description="Show available commands grouped by category.")
    async def help(self, interaction: discord.Interaction):
        pages = self._build_pages()
        view = HelpPaginationView(pages)
        await interaction.response.send_message(embed=pages[0], view=view, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(HelpCommands(bot))
