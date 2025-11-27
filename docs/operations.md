# Operations Runbook

Day-2 guidance for keeping the bot and control panel healthy.

## Releases & rollouts
- Build images directly from `frontend/Dockerfile` and `bot/Dockerfile`; avoid ad-hoc Dockerfiles so Compose stays truthful.
- Run `python3 scripts/validate_env.py`, `npm run test:server-settings`, and regenerate command docs (`python scripts/generate_command_reference.py`) before tagging.
- Apply database migrations before cutting traffic over: `cd frontend && npx prisma migrate deploy`.

## Restarts & scaling
- Frontend and bot are safe to restart independently; queue snapshots are persisted in the durable queue-sync store and mirrored to `/api/bot/queue-sync`.
- For horizontal scaling, ensure Redis/MySQL are externalised and session storage is sticky; AutoShardedBot will redistribute guilds automatically.
- Toggle chaos/scaling experiments via `.env` (`CHAOS_ENABLED`, `SCALING_ENABLED`) and tail `bot/logs` for outcomes. `/settings` commands in Discord use the same caps and branding as the control panel.

## Monitoring
- Scrape bot metrics on `:3052/metrics` (enable with `METRICS_ENABLED=true`); dashboards live in `docs/grafana/`.
- Inspect control-panel metrics/logs via your APM; key endpoints `/api/dashboard/analytics`, `/api/control-panel/*`, `/api/concierge`, `/api/bot/*` should stay under your latency SLOs.
- Queue sync durability: check `redis` keys/TTL (or your MySQL durable store) and confirm `/api/dashboard/analytics` matches recent socket events. Telemetry webhooks emit when `QUEUE_TELEMETRY_ENABLED=true`.

## Backups & data safety
- Take regular MySQL backups (subscriptions, concierge requests, audit logs) and verify restore with a staging compose stack.
- Redis caches are safe to flush; they repopulate from Lavalink and Discord.
- Keep `bot/data/` under volume/backups if you store analytics or histories there in your deployment.

## Incidents & troubleshooting
- Quick triage lives in `docs/troubleshooting.md`.
- Security findings should be cross-referenced with `docs/security/threat-model.md` and `docs/security/secure-coding-guidelines.md`.
- If queue sync or telemetry stalls, verify `QUEUE_SYNC_ENDPOINT`/`QUEUE_TELEMETRY_ENDPOINT` and control-panel API keys, then replay queue snapshots with queue commands or refresh the Status API feed in the UI.
