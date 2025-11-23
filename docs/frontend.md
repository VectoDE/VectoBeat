# Frontend (Next.js) Overview

The control panel is a Next.js App Router project that shares the root `.env` with the bot. Only `frontend/Dockerfile` is used for container builds.

## Stack
- Next.js 16 (App Router), React 19, TypeScript 5
- Prisma (MySQL) for persistence
- Socket.IO for queue/analytics broadcasts
- Stripe for billing

## Running locally
```bash
cd frontend
npm install
set -a && source ../.env && set +a   # export the shared env
npm run dev
```
The app listens on `http://localhost:3000` and assumes MySQL/Redis/Lavalink from the root compose stack.

## Tests & quality
- Integration and contract tests: `npm run test:server-settings`
- Lint: `npm run lint`
- Build: `npm run build`
- The suite includes auth gates, concierge flows, queue-sync durability, bot contract tests, and CI safety checks (env/doc consistency).

## Deployment
- Built via `frontend/Dockerfile`; the root `docker-compose.yml` references this file directly.
- Provide the same keys as `.env.example` via your orchestrator; Prisma migrations run with `npx prisma migrate deploy`.

## Key APIs
- `/api/dashboard/*` for analytics and overview
- `/api/concierge` (user-facing) and `/api/bot/concierge` (bot bridge)
- `/api/control-panel/*` for enterprise settings, audit, and API tokens

See `docs/architecture.md` for end-to-end data flow and `docs/deployment.md` for compose tips.
