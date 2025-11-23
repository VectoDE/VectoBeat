"""
Environment validation helper for both the bot and control panel.

Usage:
    python3 scripts/validate_env.py

It loads the root .env (if present) and compares it against a curated list of
required secrets. The script fails fast with a non‑zero exit code when critical
values are missing or set to well-known placeholders.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"


REQUIRED_KEYS = {
    "shared": [
        "DISCORD_TOKEN",
        "DISCORD_CLIENT_ID",
        "NEXT_PUBLIC_DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET",
    ],
    "bot": [
        "LAVALINK_HOST",
        "LAVALINK_PORT",
        "LAVALINK_PASSWORD",
        "REDIS_HOST",
        "REDIS_PORT",
    ],
    "frontend": [
        "NEXT_PUBLIC_URL",
        "DATABASE_URL",
        "DATA_ENCRYPTION_KEY",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ],
}

PLACEHOLDER_VALUES = {
    "",
    "changeme",
    "your_discord_bot_token",
    "discord_oauth_client_secret",
    "set-a-64-char-hex-secret",
    "smtp.example.com",
    "mailer@example.com",
    "sk_test_xxx",
    "whsec_xxx",
    "pk_test_xxx",
    "mysql://user:password@mysql:3306/vectobeat",
}


def parse_env_file(path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path.exists():
        return data
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = value.strip().strip("'").strip('"')
        data[key] = value
    return data


def load_env() -> Dict[str, str]:
    """Merge values from .env, the current environment, and .env.example fallback."""
    env: Dict[str, str] = {}
    env.update(parse_env_file(EXAMPLE_PATH))
    env.update(parse_env_file(ENV_PATH))
    env.update({k: v for k, v in os.environ.items() if isinstance(v, str)})
    return env


def main() -> int:
    env = load_env()
    missing: Dict[str, list] = {group: [] for group in REQUIRED_KEYS}
    insecure: Dict[str, list] = {group: [] for group in REQUIRED_KEYS}

    for group, keys in REQUIRED_KEYS.items():
        for key in keys:
            value = env.get(key, "")
            if not value or value.strip() in PLACEHOLDER_VALUES:
                target = missing if not value else insecure
                target[group].append(key)

    failures = sum(len(entries) for entries in missing.values()) + sum(len(entries) for entries in insecure.values())
    if failures == 0:
        print("✅ Environment looks good. All critical secrets are populated.")
        return 0

    print("❌ Environment validation failed.\n")
    for label, bucket in (("Missing", missing), ("Placeholder/Unsafe", insecure)):
        filtered = {group: items for group, items in bucket.items() if items}
        if not filtered:
            continue
        print(f"{label} values:")
        for group, items in filtered.items():
            keys = ", ".join(sorted(items))
            print(f"  - {group}: {keys}")
        print()

    print("Hint: copy .env.example → .env and replace every placeholder with production-grade secrets.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
