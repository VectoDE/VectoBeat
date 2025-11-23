#!/usr/bin/env python3
"""Run VectoBeat under pyinstrument to profile the event loop."""

from __future__ import annotations

import sys
from pathlib import Path

from pyinstrument import Profiler

REPO_ROOT = Path(__file__).resolve().parents[1]
BOT_ROOT = REPO_ROOT / "bot"
sys.path.insert(0, str(BOT_ROOT))


def main() -> int:
  profiler = Profiler(async_mode="enabled", interval=0.001)
  profiler.start()
  try:
    import src.main  # noqa: F401
  except Exception:
    profiler.stop()
    raise
  finally:
    profiler.stop()

  output_dir = REPO_ROOT / "profiles"
  output_dir.mkdir(parents=True, exist_ok=True)
  output_file = output_dir / "event-loop-profile.html"
  output_file.write_text(profiler.output_html(), "utf-8")
  print(f"[profile] wrote {output_file}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
