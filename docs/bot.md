# Bot Runtime Overview

The Discord bot is built on `discord.py` with Lavalink for audio transport. It uses the shared root `.env` and is containerised via `bot/Dockerfile`.

## Stack
- Python 3.11+, `discord.py` AutoShardedBot
- Lavalink v4 for playback (WebSocket + REST)
- Redis for queue snapshots/history; MySQL for concierge/success pod/audit bridges via the control panel
- Prometheus metrics on `:3052`, Status API on `:3051`

## Running locally
```bash
cd bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
set -a && source ../.env && set +a
python -m src.main
```
Requires Lavalink, Redis, and MySQL (use `docker compose up` from the repo root).

## Tests & quality
- Type check: `scripts/typecheck.sh` (pyright strict)
- Scenario harness with mock Lavalink:
  ```bash
  python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml
  ```
- Pytest sanity checks live under `bot/tests/`.

## Deployment
- Containerised via `bot/Dockerfile`; invoked from the root `docker-compose.yml`.
- Config file `bot/config.yml` is mounted by Compose; Lavalink credentials come from `.env`.
- Metrics are exposed at `http://<host>:3052/metrics`; status at `http://<host>:3051/status`.

## Bot ↔ Control Panel bridges
- `POST /api/bot/concierge` for request lifecycle (create/resolve) and usage checks.
- `POST /api/bot/queue-sync` for queue snapshots and analytics.
- `POST /api/bot/automation-actions`, `success-pod`, `scale-contact`, `events` for automation/audit flows.

See `docs/architecture.md` for the full topology and `docs/deployment.md` for compose guidance.
