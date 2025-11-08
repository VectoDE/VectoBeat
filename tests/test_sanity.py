"""Lightweight smoke tests to keep the CI quality gate healthy."""

from src.commands.queue_commands import ms_to_clock


def test_ms_to_clock_formats_minutes_and_seconds():
    assert ms_to_clock(61_000) == "1:01"


def test_ms_to_clock_formats_hours_minutes_seconds():
    assert ms_to_clock(3_661_000) == "1:01:01"
