# Event Loop Profiling

Use [pyinstrument](https://github.com/pyinstrument/pyinstrument) to capture event
loop hotspots.

## Setup
Install pyinstrument globally (for example with pipx or your system package
manager).

```bash
pipx install pyinstrument
# or: python3 -m pip install --user pyinstrument
```

## Running the profiler
Launch the bot via the profiling harness:

```bash
python scripts/profile_event_loop.py
```

This will start the bot, collect samples, and write
`profiles/event-loop-profile.html`. Open that file in a browser and use the
PyInstrument UI to inspect coroutine stacks.

Tip: profile during realistic workloads (e.g., play a queue, spam slash
commands) to capture meaningful traces.

## Adaptive Search Cache
Repeated `/play` searches now go through an in-memory cache. Adjust the
behaviour via `cache.search_*` in `config.yml` or the `CACHE_SEARCH_*`
environment variables to trade TTL vs. freshness.

## Dynamic Search Limits
The `/play` command automatically scales how many results it requests based on
bot latency and current player load. Tune `search_limits` in `config.yml` (or
the `SEARCH_*` environment variables) to raise/lower the baseline or thresholds.
