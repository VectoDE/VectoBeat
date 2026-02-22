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
    def __init__(self, pages: Sequence[discord.Embed], categories: Sequence[str]) -> None:
        super().__init__(timeout=180)
        self.pages = list(pages)
        self.index = 0
        disabled = len(self.pages) <= 1
        self.previous_button.disabled = disabled
        self.next_button.disabled = disabled

        # Category selector to jump directly to a section.
        if categories:
            options = [discord.SelectOption(label=cat, value=str(i)) for i, cat in enumerate(categories)]
            select = discord.ui.Select(placeholder="Kategorie auswählen", options=options, min_values=1, max_values=1)

            async def _on_select(interaction: discord.Interaction) -> None:
                try:
                    target = int(select.values[0])
                    self.index = max(0, min(target, len(self.pages) - 1))
                except Exception:
                    self.index = 0
                await self._update(interaction)

            select.callback = _on_select  # type: ignore[assignment]
            self.add_item(select)

    async def _update(self, interaction: discord.Interaction) -> None:
        embed = self.pages[self.index]
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="Zurück", style=discord.ButtonStyle.secondary)
    async def previous_button(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not self.pages:
            return
        self.index = (self.index - 1) % len(self.pages)
        await self._update(interaction)

    @discord.ui.button(label="Weiter", style=discord.ButtonStyle.secondary)
    async def next_button(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
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

    def __init__(self, bot: commands.Bot) -> None:
        from typing import cast, Any
        from src.main import VectoBeat
        self.bot: VectoBeat = cast(Any, bot)

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
        entries: List[Tuple[str, str, str]] = []
        for command in self.bot.tree.get_commands():
            if isinstance(command, (app_commands.Command, app_commands.Group)):
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

    def _command_details_embed(self, name: str) -> Optional[discord.Embed]:
        """Return a detailed embed for a specific command name."""
        targets: List[Tuple[str, str, str]] = []
        for command in self.bot.tree.get_commands():
            if isinstance(command, (app_commands.Command, app_commands.Group)):
                targets.extend(self._flatten_command(command))
        lookup = {full.lower(): (category, desc) for category, full, desc in targets}

        match = None
        for key, (category, desc) in lookup.items():
            if key == name.lower() or key.endswith(f" {name.lower()}") or key.lstrip("/").lower() == name.lower():
                match = (key, category, desc)
                break
        if not match:
            return None

        cmd_obj = next((c for c in self.bot.tree.get_commands() if isinstance(c, (app_commands.Command, app_commands.Group)) and match[0].lstrip("/") == c.qualified_name), None)
        parameters: List[str] = []
        if isinstance(cmd_obj, app_commands.Command):
            for param in cmd_obj.parameters:
                param_name = f"<{param.name}>"
                param_desc = param.description or "No description provided."
                optional = "" if param.required else " (optional)"
                parameters.append(f"`{param_name}`{optional} – {param_desc}")

        embed = discord.Embed(
            title=f"Hilfe zu {match[0]}",
            description=match[2],
            color=discord.Color.blurple(),
        )
        embed.add_field(name="Kategorie", value=match[1], inline=True)
        if parameters:
            embed.add_field(name="Parameter", value="\n".join(parameters), inline=False)
        else:
            embed.add_field(name="Parameter", value="_No parameters_", inline=False)
        return embed

    @app_commands.command(name="help", description="Show available commands grouped by category.")
    @app_commands.describe(command="Optional: show details for a specific command")
    async def help(self, interaction: discord.Interaction, command: Optional[str] = None) -> None:
        if command:
            detail = self._command_details_embed(command)
            if not detail:
                await interaction.response.send_message(
                    f"No command found for `{command}`.", ephemeral=True
                )
                return
            await interaction.response.send_message(embed=detail, ephemeral=True)
            return

        pages = self._build_pages()
        categories = [page.title or "General" for page in pages]
        view = HelpPaginationView(pages, categories)
        await interaction.response.send_message(embed=pages[0], view=view, ephemeral=True)

    @help.autocomplete("command")
    async def help_autocomplete(self, interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
        entries: List[Tuple[str, str, str]] = []
        for command in self.bot.tree.get_commands():
            if isinstance(command, (app_commands.Command, app_commands.Group)):
                entries.extend(self._flatten_command(command))
        values = [name for _, name, _ in entries]
        current_lower = current.lower()
        filtered = [v for v in values if current_lower in v.lower()][:25]
        return [app_commands.Choice(name=v, value=v) for v in filtered]


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(HelpCommands(bot))
