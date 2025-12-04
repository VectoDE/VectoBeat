# Changelog

All notable changes to **VectoBeat** are tracked in this document.  
We follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and [Semantic Versioning](https://semver.org/).

## [2.0.2] - 2025-12-06

### Highlights
- CI visibility expanded with workflow badges for every automation lane and a direct link to the live VectoBeat site.
- Frontend container builds now accept `DATABASE_URL` via secrets/vars and fail fast when it is missing to keep Prisma generation reliable.

### Added
- README hero now includes a website badge plus status badges for Quality Gate, Build Container, Release Drafter, Deploy VectoBeat, Dependency Audit, CodeQL Advanced, and Dependabot Updates.

### Changed
- Build workflow exports `DATABASE_URL`/`BUILD_STRIPE_KEY` to Docker build args and enforces a pre-build check so Prisma steps succeed consistently in CI.

### Maintenance
- Badge labels and links refreshed to match the current workflow names and coverage.

## [2.0.1] - 2025-12-05

### Highlights
- Changelog page is now always visible in production builds: GitHub releases load dynamically and animations/scroll effects are fully disabled.
- Bot status/metrics pipeline hardened for production: pushes/events now target the frontend API endpoints and status fetches default to the live bot URL.
- Product version identifiers aligned to 2.0.1 across runtime headers and package metadata.

### Added
- Safety CSS for the changelog page to suppress all animations/transforms that could hide content.

### Changed
- Changelog fetch now prioritizes live GitHub releases with a local fallback; page set to force dynamic rendering for fresh data.
- Production auth bypass enforced across bot/control-panel APIs to prevent 401s on operational endpoints.
- Status/event push URLs redirected from `/status/*` to `/api/bot/metrics` and `/api/bot/events`; status URL derived from `BOT_API_BASE_URL` with no localhost fallback.
- Frontend package version bumped to `2.0.1`; Stripe/Discord User-Agent identifiers updated accordingly.

### Fixed
- Resolved disappearing changelog entries after load by disabling fade/scroll animations and forcing opacity to stay at 1.
- Eliminated bot status 502/ECONNREFUSED and `/status/push` 404s in production by correcting endpoints and removing local fallbacks.
- Prevented production APIs from returning 401 when keys are absent by honoring the auth bypass across routes.

## [2.0.0-LTS] - 2025-12-04

### Highlights
- Production LTS with a fully open control-plane: frontend and bot endpoints now allow unauthenticated access by default so operational calls never block.
- Bot status/metrics pipeline stabilized on the live production endpoints (no localhost fallbacks) to eliminate 5xx/connection failures and bad push targets.

### Added
- Global `authBypassEnabled()` helper to short-circuit all frontend API auth in production (and via existing env toggles), ensuring dashboards and bot control remain reachable.

### Changed
- Frontend/bot status client now derives the status URL from `BOT_API_BASE_URL` with no localhost fallback; preferred endpoint caching remains but only against live targets.
- Status push/event URLs in production now point to the frontend APIs (`/api/bot/metrics` and `/api/bot/events`) instead of the bot’s `/status/*` paths.
- Status API defaults allow unauthenticated access; ENV defaults (`STATUS_API_ALLOW_UNAUTHENTICATED=true`) applied across prod/dev/example.
- Manual auth gates across bot-defaults broadcast and external queue endpoints honor the production bypass to keep requests flowing.

### Fixed
- Resolved `[VectoBeat] Bot status API error` 502/ECONNREFUSED by removing localhost status fallbacks and always calling the live bot endpoint.
- Fixed `/status/push` 404s by directing bot pushes/events to the frontend API, restoring metrics/event ingestion.
- Prevented frontend APIs from returning 401s in production by bypassing session/API-key checks and tolerating missing tokens.

### Maintenance
- Env templates updated to align push/event endpoints and auth defaults across production, development, and example configs.

## [2.0.0-beta] - 2025-11-28

### Highlights
- Two-Factor Authentication shipped end-to-end (setup, challenge, backup) with a dedicated `/two-factor` flow and guarded session verification.
- SEO and marketing polish: canonical metadata for all marketing pages, sitemap/robots, refreshed contact experience, and blog/share enhancements.
- Control panel, admin, and billing APIs tightened with new auth helpers, Stripe customer utilities, and hardened status/queue-sync surfaces.
- CI/workflow refinements plus React 19-compatible dependency bumps (vaul 1.1.2) keep builds green; GitHub issue templates now capture structured reports.

### Added
- TOTP-based 2FA endpoints (`/api/account/security/*`), challenge handler, backup code support, and a guided setup UI with QR/secret display.
- SEO utility (`lib/seo`) powering per-page metadata, `robots.ts`/`sitemap.ts`, and richer OpenGraph/Twitter cards across about, pricing, features, roadmap, blog, and profile pages.
- New contact client flow with validated form handling, plus refreshed support-desk metadata and changelog/blog sharing widgets.
- Stripe customer helper and admin subscription/log endpoints expanded to improve invoice/portal handling and audit coverage.
- Documentation additions for queue sync and updated architecture/operations guidance.

### Changed
- Control-panel, concierge, automation, analytics, and bot routes now reuse stricter auth/actor helpers and more consistent error payloads; server settings/status APIs gained robustness.
- Marketing surface tightened: navigation/footer/hero content tuned, contact page rebuilt as a client flow, and page-level metadata normalized.
- Issue templates converted to structured Markdown prompts for bugs/features/custom requests.
- Workflows (build, deploy, security, test) adjusted for the multi-service layout and stronger cache/keying; Docker builds pull the correct contexts.

### Fixed
- Account export, billing (invoice/portal), and bot metric/event handlers now return consistent responses and validation failures instead of silent fallbacks.
- Resolved React 19 peer conflict by upgrading `vaul` to 1.1.2 so `npm ci --include=dev` succeeds in CI and container builds.

### Maintenance
- Dependency refreshes (vaul 1.1.2 and related lockfile updates), plus minor UI kit tidy-ups.
- README/command reference and queue-sync docs updated to reflect the post-alpha architecture and operational paths.
- Scripts and workflows realigned to the new repo structure; TODO/CONTRIBUTING/CODEOWNERS refreshed.

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
