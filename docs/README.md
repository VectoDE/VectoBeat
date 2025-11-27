# VectoBeat Documentation Index

This index keeps the bot and control-panel references in one discoverable place. Start here instead of digging through subfolders.

## Deployment
- [`docs/deployment.md`](./deployment.md): Compose layout, environment loading rules (`.env` at repo root only), production overrides, and Dockerfile boundaries.
- [`docs/INSTALL_LAVALINK.md`](./INSTALL_LAVALINK.md): Provisioning Lavalink nodes for local and production.
- [`docs/development.md`](./development.md): Local iteration workflow, codegen, and lint/test entry points.
- [`docs/local_sandbox.md`](./local_sandbox.md): Running a fully local stack (bot + control panel + Lavalink + MySQL/Redis).

## Runtime Overviews
- [`docs/frontend.md`](./frontend.md): Next.js control panel stack, dev workflow, tests, and deployment.
- [`docs/bot.md`](./bot.md): discord.py bot runtime, scenarios, metrics, and deployment.

## Operations
- [`docs/operations.md`](./operations.md): Day-2 runbook (rollouts, restarts, backups, queue-sync durability, monitoring hooks).
- [`docs/observability/metrics.md`](./observability/metrics.md): Metrics surface and scraping guidance.
- [`docs/grafana/README.md`](./grafana/README.md): Prebuilt Grafana dashboards for Lavalink and shard health.
- [`docs/security/threat-model.md`](./security/threat-model.md): Threat model and incident-response checkpoints.
- [`docs/queue_telemetry.md`](./queue_telemetry.md): Queue telemetry webhook modes, payloads, and redaction rules.
- [`docs/queue_sync.md`](./queue_sync.md): Queue snapshot publisher payloads, plan gating, and consumer guidance.
- [`docs/performance.md`](./performance.md): Load-testing notes and tuning levers.

## Troubleshooting
- [`docs/troubleshooting.md`](./troubleshooting.md): Fast triage for invite/authentication issues, Lavalink connectivity, queue-sync drift, and database migration failures.
- [`docs/backend/compliance-export-jobs.md`](./backend/compliance-export-jobs.md): Recovering stuck jobs and validating audit trails.
- [`docs/security/secure-coding-guidelines.md`](./security/secure-coding-guidelines.md): Patterns to keep fixes from regressing.

## Architecture & API Surface
- [`docs/architecture.md`](./architecture.md): Narrative of the control panel and bot components, plus 4K diagram export steps.
- [`docs/system_architecture.mmd`](./system_architecture.mmd): Source Mermaid diagram (render to `assets/images/architecture.png` with mmdc).
- [`docs/command_reference.md`](./command_reference.md): Generated slash-command catalogue.
- [`docs/analytics.md`](./analytics.md): Dashboard metrics and export behaviours.
- [`docs/backend/queue-processing.md`](./backend/queue-processing.md): Control panel queue processing and persistence paths.
- [`docs/backend/regional-failover.md`](./backend/regional-failover.md): Multi-region behaviours and failover switches.

If you add a new guide, link it here so CI can enforce discoverability.
