"""Utility for configuring project wide logging behaviour."""

import logging
import logging.handlers
import sys
from pathlib import Path


def setup_logging() -> None:
    """Initialise logging handlers and adjust default noisy loggers."""
    fmt = "[%(asctime)s] %(levelname)s:%(name)s: %(message)s"

    # Ensure log directory exists for file outputs.
    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    # Combined log file for all records.
    combined_handler = logging.handlers.RotatingFileHandler(
        log_dir / "vectobeat.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    combined_handler.setFormatter(logging.Formatter(fmt))

    # Error-only log file to quickly spot issues.
    error_handler = logging.handlers.RotatingFileHandler(
        log_dir / "vectobeat.error.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(logging.Formatter(fmt))

    # Console handler for local development visibility.
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(logging.Formatter(fmt))

    logging.basicConfig(
        level=logging.INFO,
        format=fmt,
        handlers=[stream_handler, combined_handler, error_handler],
    )
    logging.getLogger("discord").setLevel(logging.INFO)
    # Lavalink handles its own server-side logging; nothing special to configure client-side.


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the specified name."""
    return logging.getLogger(name)
