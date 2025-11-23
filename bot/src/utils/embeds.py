"""Centralised helpers for building branded Discord embeds."""

import discord
from typing import Optional, Iterable, Callable, Dict, Any
from src.configs.settings import CONFIG

_branding_resolver: Optional[Callable[[Optional[int]], Optional[Dict[str, Any]]]] = None


def set_branding_resolver(resolver: Callable[[Optional[int]], Optional[Dict[str, Any]]]) -> None:
    """Inject a resolver used to compute guild-specific branding."""
    global _branding_resolver
    _branding_resolver = resolver


class EmbedFactory:
    """Centralized, branded embed factory for VectoBeat."""
    def __init__(self, guild_id: Optional[int] = None):
        self.theme = CONFIG.theme
        self.guild_id = str(guild_id) if guild_id else None
        branding = self._resolve_branding()
        self._accent_color = branding.get("accent")
        self._white_label = branding.get("white_label", False)
        self._embed_accent = branding.get("embed_accent")
        self._embed_logo = branding.get("embed_logo")
        self._embed_cta_label = branding.get("embed_cta_label")
        self._embed_cta_url = branding.get("embed_cta_url")

    def _base(self, title: Optional[str], description: Optional[str], color: int) -> discord.Embed:
        """Return a themed embed with common footer/author decorations."""
        resolved_color = self._embed_accent or color
        e = discord.Embed(
            title=title if title is not None else None,
            description=description if description is not None else None,
            color=resolved_color,
        )
        if not self._white_label:
            if self.theme.footer_text:
                footer_icon = self.theme.footer_icon_url or None
                e.set_footer(text=self.theme.footer_text, icon_url=footer_icon)
            if self.theme.author_name:
                author_icon = self.theme.author_icon_url or None
                e.set_author(name=self.theme.author_name, icon_url=author_icon)
            if self.theme.thumbnail_url:
                e.set_thumbnail(url=self.theme.thumbnail_url)
        if self._embed_logo:
            e.set_thumbnail(url=self._embed_logo)
        if self._embed_cta_label and self._embed_cta_url:
            e.add_field(
                name="Action",
                value=f"[{self._embed_cta_label}]({self._embed_cta_url})",
                inline=False,
            )
        return e

    def _resolve_branding(self) -> Dict[str, Any]:
        if not self.guild_id or not _branding_resolver:
            return {}
        try:
            branding = _branding_resolver(int(self.guild_id))
        except Exception:
            return {}
        if not isinstance(branding, dict):
            return {}
        color_value: Optional[int] = None
        color = branding.get("accent")
        if isinstance(color, str):
            sanitized = color.strip()
            if sanitized.startswith("#"):
                sanitized = sanitized[1:]
            try:
                color_value = int(sanitized, 16)
            except ValueError:
                color_value = None
        branding_copy = dict(branding)
        if color_value is not None:
            branding_copy["accent"] = color_value
        embed_accent = branding.get("embed_accent")
        if isinstance(embed_accent, str):
            sanitized = embed_accent.strip().lstrip("#")
            try:
                branding_copy["embed_accent"] = int(sanitized, 16)
            except ValueError:
                branding_copy["embed_accent"] = None
        return branding_copy

    # Generic
    def primary(self, title: str, description: Optional[str] = None) -> discord.Embed:
        color = self._accent_color or self.theme.color_primary
        return self._base(title, description, color)

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
