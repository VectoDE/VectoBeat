# Bot Runtime Overview

The Discord bot is built on `discord.py` with Lavalink for audio transport. It shares the root `.env` with the control panel and is containerised via `bot/Dockerfile` (root build context).

## Stack
- Python 3.12, `discord.py` AutoShardedBot
- Lavalink v4 for playback (WebSocket + REST)
- Redis for queue snapshots/history and autoplay hints; MySQL for concierge/success pod/automation bridges via the control panel
- Prometheus metrics on `:3052`, Status API on `:3051`
- Queue sync publisher + telemetry webhook emitter, analytics export buffer, automation audit, concierge/success pod/scale contact services

## Running locally
```bash
cd bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
set -a && source ../.env && set +a
python -m src.main
```
Requires Lavalink, Redis, and MySQL (use `docker compose up` from the repo root to start dependencies).

## Tests & quality
- Type check: `scripts/typecheck.sh` (pyright strict)
- Pytest sanity checks live under `bot/tests/`
- Scenario harness with mock Lavalink:
  ```bash
  python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml
  ```

## Deployment
- Containerised via `bot/Dockerfile`; invoked from the root `docker-compose.yml` (context `.` so assets/config are available).
- Config file `bot/config.yml` is mounted by Compose; Lavalink credentials come from `.env`.
- Metrics are exposed at `http://<host>:3052/metrics`; status at `http://<host>:3051/status`.

## Bot ↔ Control Panel bridges
- `/api/bot/server-settings` powers `/settings` commands, branding, queue caps, routing, and plan-aware AI recommendations.
- `/api/bot/queue-sync` receives queue snapshots (snapshot vs. realtime depending on tier).
- `/api/bot/events` and `/api/bot/automation-actions` capture audit/automation outcomes.
- `/api/bot/concierge`, `/api/bot/success-pod`, `/api/bot/scale-contact` handle concierge and success-pod lifecycles.

See `docs/architecture.md` for the full topology and `docs/deployment.md` for compose guidance.
