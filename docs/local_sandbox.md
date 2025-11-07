# Local Sandbox Stack

A docker-compose stack is provided for contributors who want to run VectoBeat
with all required dependencies locally (Lavalink, Redis, Postgres).

## Prerequisites
- Docker Desktop (or compatible engine)
- A Discord bot token

## Quick Start
1. Copy `.env.local.example` to `.env.local` and insert your Discord token.
2. Run the stack:
   ```bash
   docker compose -f docker-compose.local.yml up --build
   ```
3. The services that come up:
   - `lavalink` on `localhost:2333` with password `localpass`
   - `redis` on `localhost:6379`
   - `postgres` on `localhost:5432`
   - `vectobeat` bot service (auto-reloads when files change via bind mount)

You can also run only the dependencies and execute the bot on your host:

```bash
docker compose -f docker-compose.local.yml up lavalink redis postgres
python3 -m src.main
```

## Cleaning Up
Stop the compose stack with `Ctrl+C` or `docker compose down`. To wipe the
Postgres volume, add `--volumes` when running `docker compose down`.
