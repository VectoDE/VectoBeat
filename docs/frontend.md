# Frontend (Next.js) Overview

The control panel is a Next.js App Router project that shares the root `.env` with the bot. `frontend/Dockerfile` is the single build target and expects `plan-capabilities.json` plus the Prisma schema at build time.

## Stack
- Next.js 16.1+ (App Router), React 19, TypeScript 5 on Node 20
- Prisma (MySQL) for persistence and plan enforcement
- Socket.IO for queue/analytics broadcasts and dashboard live updates
- Stripe for billing and entitlement provisioning
- Vercel Speed Insights & Web Analytics for performance/usage telemetry

## Key Features
- **Dashboard**: Real-time control of the bot (volume, skip, pause).
- **Concierge**: Request support or custom features.
- **Domain Branding**: (Growth Tier) Configure CNAME and custom embed branding.
- **Billing**: Stripe integration for subscription management.

## Running locally
```bash
cd frontend
npm install
set -a && source ../.env && set +a   # export the shared env
npm run dev -p 3050
```
The app listens on `http://localhost:3050` and assumes MySQL/Redis/Lavalink from the root compose stack.

## Tests & quality
- Integration and contract suite: `npm run test:server-settings` (auth gates, plan drift, queue-sync store durability, bot bridge contracts, concierge/success pod APIs).
- Lint: `npm run lint`
- Build: `npm run build`

## Deployment
- Built via `frontend/Dockerfile` using the repo root as context; the compose file and CI jobs mirror this.
- Provide the same keys as `.env.example` via your orchestrator; run `npx prisma migrate deploy` before serving traffic.
- The runtime honours `PORT=3050` and pushes bot metrics/events when `BOT_STATUS_API_URL`/`BOT_STATUS_API_KEY` are set.

## Key APIs
- `/api/dashboard/*` and `/api/control-panel/*` for analytics, plan enforcement, routing, and audit trails.
- `/api/concierge` (user-facing) and `/api/bot/concierge` (bot bridge).
- `/api/bot/server-settings`, `/api/bot/events`, `/api/bot/queue-sync`, `/api/bot/success-pod`, `/api/bot/scale-contact` for bot bridges and durable queue sync.

See `docs/architecture.md` for end-to-end data flow and `docs/deployment.md` for compose tips.
