# Deployment Guide

VectoBeat ships with a single `docker-compose.yml` at the repository root that builds exactly two service images: `frontend/Dockerfile` and `bot/Dockerfile` using the repository root as build context. Everything else (MySQL, Redis, Lavalink) is pulled as images from Docker Hub/GHCR. Keep all environment variables in the root `.env` so both services stay in sync in every environment.

## One-time setup
- Copy `.env.example` to `.env` in the repo root and fill in secrets once. Do **not** create per-service `.env` files; CI fails if it finds any.
- Ensure `bot/config.yml` matches the Lavalink values you set in `.env`.
- Run `python3 scripts/validate_env.py` from the repo root to catch missing variables before a release.

## Local & staging with Compose
```bash
docker compose up -d --build
docker compose logs -f frontend bot
```
- Compose automatically loads the root `.env`, mounts `bot/config.yml`, and maps `bot/data` for persistence. Both images use the repo root as context so `plan-capabilities.json`, assets, and Prisma schema are available; `frontend/Dockerfile` runs `npm ci`, `prisma generate`, and `next build` automatically.
- Use an override file (e.g. `docker-compose.override.yml`) to tune CPU/memory reservations without touching the base file.
- Regenerate Prisma migrations before the first boot if you change the schema: `cd frontend && npx prisma migrate dev`.

## Production
- Build/push images from CI with the same Dockerfiles referenced by `docker-compose.yml`; avoid per-env Dockerfiles to reduce drift.
- Provide a production `.env` through your orchestrator/secret store; it must expose the same keys as `.env.example`.
- For multi-region or HA deployments, run Redis/MySQL as managed services and point the bot/front end at those hosts via `.env`.
- Enable `METRICS_ENABLED=true` for the bot and scrape `:3052/metrics`; pipe frontend metrics/logs into your APM of choice.

## Health & smoke checks
- Frontend: `/` (healthcheck baked into Compose) and `/api/dashboard/overview` (auth required) once sessions are seeded.
- Bot: `GET /status` (mapped to port `3051`) plus Grafana dashboards in `docs/grafana/`.
- After upgrades, run the smoke flow in `docs/troubleshooting.md#smoke-checklist` against a fresh compose stack to confirm parity with the marketing site.
