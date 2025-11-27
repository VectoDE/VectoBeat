# Development Guide

Use the shared root `.env` for both runtimes. No per-service `.env` files are supported.

## Bot (Python) dev loop
- Create a venv in `bot/`, then load the root `.env` when running: `set -a && source ../.env && set +a`.
- Type-check with `scripts/typecheck.sh` (pyright strict).
- Scenario harness (mock Lavalink) lives in `bot/tests/scenarios/`:
  ```bash
  python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml
  ```
- Regenerate the slash-command catalogue for docs:
  ```bash
  python scripts/generate_command_reference.py
  ```

## Frontend (Next.js) dev loop
- Install deps in `frontend/` and run `npm run dev -p 3050` (loads the root `.env` via your shell or Compose).
- Primary test suite (auth, control-panel, queue-sync, bot contracts):
  ```bash
  cd frontend
  npm run test:server-settings
  ```
- Build: `npm run build`; lint: `npm run lint`.

## Local stack
- Use the root compose file for local work: `docker compose up -d --build`.
- Services: frontend (3050), bot status (3051), bot metrics (3052), MySQL (3306), Redis (6379), Lavalink (2333).
- See `docs/local_sandbox.md` for port mappings, health checks, and troubleshooting.
