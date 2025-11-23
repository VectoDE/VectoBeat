# Changelog

All notable changes to **VectoBeat** are tracked in this document.  
We follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and [Semantic Versioning](https://semver.org/).

## [2.0.0-alpha] - 2025-11-22

### Highlights
- Major control-panel/Discord API hardening: session-bound account settings, tenant isolation for dashboard/subscriptions, actor-aware API tokens.
- Concierge bridge completed end-to-end: bot ↔ control panel route, durable concierge model, request IDs propagated to Discord/email.
- Durable queue-sync store (Redis/MySQL) with TTL/eviction keeps analytics live across restarts and multiple workers.
- Bot contract/load tests plus enterprise integration coverage (control-panel settings, concierge, success pod, security audit, analytics export, queue-sync).
- Production readiness sweep: single root `.env`, centralized scripts, docker-compose parity, refreshed docs index and Grafana queue health dashboard.
- Roadmap/forum alignment for 2026 releases, including security patching cadence and enterprise hardening tracks.

### Added
- **Auth & Security**
  - `verifyRequestForUser` returns the authenticated profile and is enforced across account settings, dashboard, concierge, control-panel APIs.
  - API tokens include actor metadata in creation/rotation/leak notifications; emails/logs no longer show `unknown`.
  - Enterprise hardening items planned: SSO/SAML, SCIM lifecycle, signed audit/event payloads.
- **Concierge**
  - Secret-protected `/api/bot/concierge` (GET usage; POST create/resolve) with subscription gating and request ID propagation.
  - Concierge model extended to return IDs and store resolution metadata/notes; bot/UI consume IDs.
- **Queue Sync & Analytics**
  - Durable queue-sync store replaces in-memory Map with plan-tier TTL/eviction.
  - `/api/queue-sync` and `/api/dashboard/analytics` read/write through the durable store to stay fresh after redeploys.
  - Queue-sync concurrency tests simulate multiple Next.js workers and socket broadcasts.
- **Bot Contracts & Load Testing**
  - Contract tests for `/api/bot/*` (queue sync, automation audit, success pod, scale contact, concierge) to detect payload drift.
  - Load/failover simulations: multiple queue-sync writers, concurrent concierge requests, rapid API token churn.
- **Docs & Ops**
  - Centralized docs index (deployment, ops, troubleshooting) and updated architecture diagram; added queue health Grafana dashboard.
  - Ports standardized: frontend 3050, bot status 3051, bot metrics 3052; `.env.example`/compose aligned.
  - Roadmap and `FURTHER_DEVELOPMENT.md` synced for 2026 (forum telemetry, zero-downtime security patching, enterprise hardening).

### Changed
- Frontend Docker build uses root context, includes Prisma/plan capabilities, builds via npm; compose healthchecks point to new ports.
- Bot config/schema defaults updated to status port 3051 and metrics port 3052; control panel base URL defaults to 3050.
- README refreshed with translucent banners, consolidated commands table, and updated setup/service port guidance.
- `.gitignore` tightened to block stray envs and editor/OS cruft; only root `.env`/.env.example allowed.

### Fixed
- Session enforcement prevents cross-tenant access on account settings, dashboard overview, subscriptions, concierge endpoints.
- Queue-sync analytics remain live after restarts; stale in-memory snapshots eliminated.
- CI now checks docs links and env drift to prevent broken references or missing vars.

### Maintenance
- Docker-compose healthchecks and bot status fallbacks updated to new ports.
- Added Grafana queue health dashboard and scrape hints for updated metrics endpoints.
- Roadmap/frontend data updated to include forum telemetry, security patching cadence, enterprise hardening milestones.

## [1.0.0 LTS] - 2025-11-08

### Highlights

- First long-term support build with a frozen slash-command surface, hardened observability stack, and reproducible artifacts.
- Operations suite delivers queue telemetry, command analytics, auto-scaling hooks, chaos drills, and governance docs for enterprise roll-outs.
- Playback, queueing, and per-guild customisation matured with Redis-backed playlists, history-aware autoplay, DJ permissions, rich embeds, and adaptive profiles.
- Infrastructure stack (Docker, docker-compose, GitHub Actions, onboarding assets, operator scripts) enables deterministic builds from prototype to production.

### Added

- **Quality & Documentation**
  - Test workflow matrix runs linting, bytecode compilation, and `pytest` for Python 3.10/3.11 while auto-seeding a minimal `.env` (`tests/conftest.py`, `9780464`, `d889f41`).
  - Documentation guard regenerates the architecture diagram with pinned Mermaid CLI and fails if `assets/images/architecture.png` drifts (`57d137a`).
  - README plus `docs/command_reference.md` gained badges, rich tables, and an auto-generated slash-command overview (`287d047`).
- **Observability & Automation**
  - Diagnostics suite with `/status`, `/ping`, `/permissions`, `/lavalink`, `/guildinfo`, and `/botinfo` exposes latency distributions, resource metrics, and Lavalink node stats (`src/commands/info_commands.py`, `efedc0f`, `92efaa6`).
  - `/voiceinfo` and refreshed permission audits surface channel rights, latency, and player status live (`src/commands/connection_commands.py`, `e2a49d4`).
  - Auto-scaling service plus `/scaling status|evaluate` compares shard/node demand to targets and signals Nomad/custom orchestrators (`src/services/scaling_service.py`, `src/commands/scaling_commands.py`, `efedc0f`).
  - Queue telemetry webhooks and docs forward play/skip/finish events; opt-in command analytics adds hashed user telemetry with batch flush/local log fallback (`docs/queue_telemetry.md`, `src/services/queue_telemetry_service.py`, `docs/analytics.md`, `src/services/analytics_service.py`).
  - Chaos engineering commands enable guided resilience drills directly from Discord (`src/commands/chaos_commands.py`, `docs/command_reference.md`).
- **Playback & Queueing**
  - Per-guild playback profiles (`/profile show|set-volume|set-autoplay|set-announcement`) persist JSON-backed defaults and push them live to Lavalink players (`src/commands/profile_commands.py`, `src/services/profile_service.py`, `52cbbd9`).
  - Redis-backed playlists and autoplay history (`/playlist save|load|list|delete`) prevent repeats through history-aware autoplay and artist rotation (`src/services/playlist_service.py`, `src/services/autoplay_service.py`, `queue_commands.py`, `52cbbd9`).
  - Crossfade and gapless playback ship with tunable fade steps and base volume controls in `config.yml` (`crossfade.*`, `52cbbd9`).
  - Rich now-playing embeds add requester metadata, progress bars, and permission audits; Lavalink integration records requester IDs for telemetry (`src/commands/music_controls.py`, `4f95ad2`).
  - DJ permissions (`/dj add-role|remove-role|show|clear`) protect critical queue operations (`src/commands/dj_commands.py`).
  - Core playback/voice commands from the prototype (`/play`, `/pause`, `/resume`, `/seek`, `/skip`, `/queue`, `/nowplaying`, `/volume`, `/connect`, `/disconnect`, `/voiceinfo`) anchor the UX (`src/commands/music_controls.py`, `src/commands/connection_commands.py`, `36e3c3e`).
- **Infrastructure & Onboarding**
- Production-grade Docker setup (multi-stage `Dockerfile`, `docker-compose.yml`, `docker-compose.local.yml`) plus Lavalink installation guide streamline deployments (`docs/INSTALL_LAVALINK.md`, `3b48611`).
  - GitHub Actions for build, deploy, docs, security, and releases create a complete automation pipeline (`.github/workflows/*.yml`, `3b48611`).
  - Operational scripts (profiling harness, scenario runner, command reference generator, `typecheck.sh`) improve local QA (`scripts/*.py`, `scripts/typecheck.sh`).
  - Repository onboarding delivers README, Apache 2.0 license, sample `.env`, branding assets, typed config, and health/telemetry services (`README.md`, `assets/images/logo.png`, `src/configs/schema.py`, `src/services/*`, `13c6bf0`).

### Changed

- Docs builds skip the npm cache so runners never reuse stale assets (`d1ac8b6`).
- Source modules were cleaned of dead imports and unused helpers, speeding up type checks and SAST scans (`src/commands/*`, `5f65f20`).
- Logging and error surfacing were standardised; queue/DJ actions now enter the telemetry stream with actor metadata (`src/commands/music_controls.py`, `src/commands/queue_commands.py`, `9b824c3`).
- Project governance (CODEOWNERS, Security Policy, Support Guide, PR template) now lives centrally under `.github/` (`55877b8`).

### Fixed

- `/about` and status embeds reliably send ephemeral responses and gracefully handle missing permissions (`src/commands/info_commands.py`, `14a3274`).
- Components that disable Discord views no longer fire multiple buttons at once (`src/commands/music_controls.py::disable_all_items`, `d4019dc`).
- Deploy workflow now loads secrets via the proper environment variables and no longer blocks on the SCP step (`.github/workflows/deploy.yml`, `c2c2d95`).

### Maintenance

- Base container image moved to `python:3.14-slim`, aligning local dev, Docker, and CI (`Dockerfile`, `08ef302`).
- GitHub Actions upgraded to the latest majors (build-push-action v6, setup-node v6, upload-artifact v5, appleboy ssh/scp 1.x) to clear security advisories (`b80b1e1`-`529202a`).
- Multiple workflow runners now share unified dependency caches, reducing release lead time (`d559121`, `5e74330`, `f52830e`, `1733c56`).
