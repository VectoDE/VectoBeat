# Development Guide

## Type Checking
We require pyright to pass before merging. Install it globally via npm:

```bash
npm install -g pyright
```

Then run:

```bash
scripts/typecheck.sh
```

This runs pyright in strict mode using `pyrightconfig.json`.

## Pre-Commit Checklist
- `python3 -m compileall src`
- `scripts/typecheck.sh`
- `python3 -m pytest` (when tests are added)

## Scenario Test Harness
Use the mock Lavalink harness to validate queue flows:

```bash
scripts/run_scenarios.py tests/scenarios/basic_queue.yaml
```

Add new scenarios under `tests/scenarios/` using the YAML schema consumed by
`ScenarioRunner` (see `tests/scenarios/basic_queue.yaml`).

## Command Reference Generator
Keep the public slash-command docs in sync:

```bash
python scripts/generate_command_reference.py
```

This regenerates `docs/command_reference.md` by scraping `src/commands` for
decorated slash commands.

## Local Sandbox
If you need Lavalink/Redis/Postgres locally, copy `.env.local.example` to
`.env.local`, add your bot token, then run:

```bash
docker compose -f docker-compose.local.yml up --build
```

See `docs/local_sandbox.md` for additional details.
