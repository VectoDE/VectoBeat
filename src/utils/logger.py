"""Utility for configuring project wide logging behaviour."""

import logging
import sys


def setup_logging():
    """Initialise logging handlers and adjust default noisy loggers."""
    fmt = "[%(asctime)s] %(levelname)s:%(name)s: %(message)s"
    logging.basicConfig(
        level=logging.INFO,
        format=fmt,
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logging.getLogger("discord").setLevel(logging.INFO)
    # Lavalink handles its own server-side logging; nothing special to configure client-side.
