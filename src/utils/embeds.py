"""Centralised helpers for building branded Discord embeds."""

import discord
from typing import Optional, Iterable
from src.configs.settings import CONFIG


class EmbedFactory:
    """Centralized, branded embed factory for VectoBeat."""
    def __init__(self, guild_id: Optional[int] = None):
        self.theme = CONFIG.theme
        self.guild_id = str(guild_id) if guild_id else None

    def _base(self, title: Optional[str], description: Optional[str], color: int) -> discord.Embed:
        """Return a themed embed with common footer/author decorations."""
        e = discord.Embed(
            title=title if title is not None else None,
            description=description if description is not None else None,
            color=color,
        )
        if self.theme.footer_text:
            footer_icon = self.theme.footer_icon_url or None
            e.set_footer(text=self.theme.footer_text, icon_url=footer_icon)
        if self.theme.author_name:
            author_icon = self.theme.author_icon_url or None
            e.set_author(name=self.theme.author_name, icon_url=author_icon)
        if self.theme.thumbnail_url:
            e.set_thumbnail(url=self.theme.thumbnail_url)
        return e

    # Generic
    def primary(self, title: str, description: Optional[str] = None) -> discord.Embed:
        return self._base(title, description, self.theme.color_primary)

    def success(self, title: str, description: Optional[str] = None) -> discord.Embed:
        return self._base(title, description, self.theme.color_success)

    def warning(self, title: str, description: Optional[str] = None) -> discord.Embed:
        return self._base(title, description, self.theme.color_warning)

    def error(self, description: str, title: str = "Error") -> discord.Embed:
        return self._base(title, description, self.theme.color_error)

    # Rich cards
    def track_card(
        self,
        *,
        title: str,
        author: str,
        duration: str,
        url: Optional[str] = None,
        requester: Optional[str] = None,
        thumbnail: Optional[str] = None,
        footer_extra: Optional[str] = None,
    ) -> discord.Embed:
        e = self.primary(title=title, description=f"*{author}*")
        if url:
            e.url = url
        e.add_field(name="Duration", value=f"`{duration}`", inline=True)
        if requester:
            e.add_field(name="Requested by", value=requester, inline=True)
        if thumbnail:
            e.set_thumbnail(url=thumbnail)
        if footer_extra and e.footer and e.footer.text:
            e.set_footer(
                text=f"{e.footer.text} • {footer_extra}",
                icon_url=e.footer.icon_url,
            )
        return e

    def queue_page(self, *, items: Iterable[str], page: int, pages: int) -> discord.Embed:
        e = self.primary("Queue")
        e.description = "\n".join(items) or "_empty_"
        footer_icon = self.theme.footer_icon_url or None
        e.set_footer(text=f"Page {page}/{pages} • {self.theme.footer_text}", icon_url=footer_icon)
        return e
