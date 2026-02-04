import pytest
from unittest.mock import MagicMock, patch
from src.utils.embeds import EmbedFactory, set_branding_resolver

@pytest.fixture
def mock_config():
    with patch("src.utils.embeds.CONFIG") as mock:
        mock.theme.color_primary = 0x123456
        mock.theme.color_success = 0x00FF00
        mock.theme.color_warning = 0xFFFF00
        mock.theme.color_error = 0xFF0000
        mock.theme.footer_text = "Footer"
        mock.theme.footer_icon_url = "http://footer.icon"
        mock.theme.author_name = "Author"
        mock.theme.author_icon_url = "http://author.icon"
        mock.theme.thumbnail_url = "http://thumb.url"
        yield mock

def test_embed_factory_defaults(mock_config):
    factory = EmbedFactory()
    embed = factory.primary("Title", "Desc")
    
    assert embed.title == "Title"
    assert embed.description == "Desc"
    assert embed.color.value == 0x123456
    assert embed.footer.text == "Footer"
    assert embed.footer.icon_url == "http://footer.icon"

def test_embed_factory_branding(mock_config):
    resolver = MagicMock(return_value={
        "accent": 0xABCDEF,
        "embed_logo": "http://logo.url"
    })
    set_branding_resolver(resolver)
    
    factory = EmbedFactory(guild_id=123)
    embed = factory.primary("Title", "Desc")
    
    resolver.assert_called_with(123)
    assert embed.color.value == 0xABCDEF
    assert embed.thumbnail.url == "http://logo.url"

def test_branding_sanitization(mock_config):
    # Test hex string sanitization
    resolver = MagicMock(return_value={
        "accent": "#FF00FF"
    })
    set_branding_resolver(resolver)
    
    factory = EmbedFactory(guild_id=123)
    embed = factory.primary("Title")
    
    assert embed.color.value == 0xFF00FF
