#!/usr/bin/env python3
"""CLI entry point for running queue scenario files."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tests.scenarios.runner import ScenarioRunner, ScenarioAssertionError


def run(path: Path) -> bool:
    runner = ScenarioRunner()
    try:
        runner.run(path)
    except ScenarioAssertionError as exc:
        print(f"[FAIL] {path}: {exc}")
        return False
    except Exception as exc:  # pragma: no cover - CLI convenience
        print(f"[ERROR] {path}: {exc}")
        return False
    print(f"[OK]   {path}")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Lavalink queue scenarios")
    parser.add_argument("scenarios", nargs="+", help="Path(s) to YAML scenario files")
    args = parser.parse_args(argv)
    success = True
    for scenario_path in args.scenarios:
        success &= run(Path(scenario_path))
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
