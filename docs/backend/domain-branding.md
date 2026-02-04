# Domain Branding & CNAME Feature

## Overview

The Domain Branding feature allows "Growth" tier customers (and above) to white-label the VectoBeat experience. This includes:

1.  **Custom CNAME**: Users can point their own domain (e.g., `music.living-bots.net`) to the VectoBeat dashboard.
2.  **Branded Embeds**: Discord bot embeds (now playing, queue, etc.) reflect the guild's brand color, logo, and footer.
3.  **Asset Hosting**: Logos and other assets are served from the custom domain.

## Architecture

### Frontend / Control Panel
- **DNS Verification**: The `domain-branding` API route handles CNAME verification. It checks if the user's domain CNAME record points to the VectoBeat host.
- **Settings Storage**: Validated settings are stored in the `ServerSetting` Prisma model under the `domain_branding` key.
- **Sanitization**: All input domains are sanitized to prevent abuse (e.g., stripping protocol prefixes, validating TLDs).

### Bot Runtime
- **EmbedFactory**: A centralized factory (`src/utils/embeds.py`) generates all Discord embeds.
- **Branding Resolver**: The factory queries the Control Panel API (or local cache) to fetch guild-specific branding.
- **Fallback**: If no branding is configured or the guild is not on a qualifying tier, standard VectoBeat branding is used.

## Configuration

To enable this feature locally or in production:

1.  **Environment Variables**:
    - `NEXT_PUBLIC_APP_URL`: The base URL of the main application.
    - `CNAME_TARGET_DOMAIN`: The domain users should point their CNAME to (e.g., `app.vectobeat.com`).

2.  **Permissions**:
    - The Discord user must have `MANAGE_GUILD` permissions.
    - The guild must have an active subscription to the "Growth" tier or higher.

## Security

- **DNS Rebinding Protection**: The verification process ensures the domain resolves to the expected IP/host before activation.
- **Ownership Verification**: Users must prove ownership via the CNAME record.
- **Content Policy**: Custom asset URLs are validated to ensure they point to safe, accessible image resources.
