"""Pytest configuration helpers."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Ensure config bootstrap has the secrets it needs during CI/unit tests.
os.environ.setdefault("DISCORD_TOKEN", "TEST_TOKEN")
os.environ.setdefault("LAVALINK_HOST", "localhost")
os.environ.setdefault("LAVALINK_PORT", "2333")
os.environ.setdefault("LAVALINK_PASSWORD", "testing-token")
