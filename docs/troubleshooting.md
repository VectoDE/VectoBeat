# Troubleshooting & Smoke Checks

Common failures and how to resolve them quickly.

## Authentication & invites
- **Bot invite fails or shows the wrong scopes**: Regenerate the link with your live `DISCORD_CLIENT_ID` and the scopes `bot applications.commands identify`. The README badges link to the invite and DiscordBotList listing—update both if you rotate the client ID.
- **Frontend OAuth loop**: Ensure `DISCORD_CLIENT_SECRET` and `NEXT_PUBLIC_DISCORD_CLIENT_ID` match `DISCORD_CLIENT_ID` in `.env`, and that the Discord redirect URIs include `https://<host>/api/auth/discord/callback`.

## Lavalink & playback
- **Bot reports Lavalink unavailable**: Check `LAVALINK_HOST/PORT/PASSWORD` in `.env` match `bot/config.yml` and that port `2333` is reachable from the bot container. The Compose healthcheck should turn green before the bot starts playback.
- **Playback stutters after redeploy**: Confirm Redis is reachable and that the queue-sync durable store is online; stale caches will force re-fetches.

## Queue sync & analytics
- **Dashboard analytics stale after deploy**: Verify the durable queue store (Redis/MySQL) is writable and that `/api/dashboard/analytics` reads from it. Run `npm run test:server-settings -- --test-name-pattern queue-sync` if needed.
- **Socket events missing**: Check that `QUEUE_SYNC_ENDPOINT`/`QUEUE_SYNC_API_KEY` are set and that workers share the same durable store.

## Database & migrations
- **Migrations failing**: Run `npx prisma migrate deploy` inside the frontend container and inspect `DATABASE_URL` in `.env`. Ensure the MySQL user has `ALTER` privileges.
- **Ops audit logs empty**: Confirm `CONTROL_PANEL_API_ENABLED=true` and that subscription tiers are seeded; the integration tests cover auth drift, but production still depends on correct database bootstrap.

## Smoke checklist (post-release)
- Invite the bot using the README badge, join a voice channel, and exercise `/play`, `/queue`, `/skip`, `/pause`.
- Log into the control panel, update a setting, and confirm the audit trail exists.
- Trigger `/api/concierge` from the UI and resolve via `/api/bot/concierge` (or the bot) with the propagated request ID.
- Export analytics and confirm `/api/dashboard/analytics` reflects fresh queue-sync data after a restart.
