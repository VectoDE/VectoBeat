# Local Sandbox Stack

Run the full system locally with the single root `docker-compose.yml`. All services pull configuration from the shared root `.env`.

## Prerequisites
- Docker Desktop (or compatible engine)
- A populated root `.env` (copy from `.env.example`)

## Quick Start
1. Populate `.env` in the repo root (Discord token, MySQL creds, Lavalink password, Stripe keys if needed).
2. Launch everything:
   ```bash
   docker compose up -d --build
   docker compose logs -f frontend bot
   ```
3. Services:
   - `frontend` on `http://localhost:3050`
   - `bot` status on `http://localhost:3051/status` and metrics on `http://localhost:3052/metrics`
   - `lavalink` on `localhost:2333` (password `localpass` by default)
   - `redis` on `localhost:6379`
   - `mysql` on `localhost:3306`

You can also run just the dependencies and execute the bot locally:

```bash
docker compose up lavalink redis mysql
cd bot && set -a && source ../.env && set +a && python -m src.main
```

## Cleaning Up
Stop with `docker compose down`. Add `--volumes` to wipe MySQL/Redis data. Logs remain under the service containers.
