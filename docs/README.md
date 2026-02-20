# VectoBeat Documentation

Welcome to the VectoBeat documentation. This directory contains all the information you need to understand, deploy, and contribute to VectoBeat.

## Documentation Structure

The documentation is organized into the following categories:

- **Deployment:** Guides for deploying VectoBeat in various environments.
- **Runtime Overviews:** Information about the bot and control panel runtimes.
- **Operations:** Day-to-day operational guides, including monitoring and security.
- **Troubleshooting:** Help with common issues and errors.
- **Architecture & API Surface:** In-depth information about the system architecture and API.

## Mermaid Diagrams

We use [Mermaid](https://mermaid-js.github.io/mermaid/#/) to create diagrams and charts in our documentation. Mermaid is a simple, markdown-like syntax that allows you to create and modify diagrams with ease.

### Creating and Rendering Diagrams

To create a new diagram, simply create a new `.mmd` file and write your Mermaid syntax. To render a diagram as an image, you can use the [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli) (`mmdc`).

#### Installation

To install the Mermaid CLI, you'll need to have Node.js and npm installed. Then, you can install the CLI globally by running the following command:

```bash
npm install -g @mermaid-js/mermaid-cli
```

#### Rendering

Once you have the Mermaid CLI installed, you can render a diagram as a PNG, SVG, or PDF file. For example, to render the `system_architecture.mmd` file as a PNG image, you would run the following command:

```bash
mmdc -i docs/system_architecture.mmd -o docs/assets/images/architecture.png
```

You can also specify the output format using the `-O` flag:

```bash
mmdc -i docs/system_architecture.mmd -o docs/assets/images/architecture.svg -O svg
```

You can find the main system architecture diagram in [`docs/system_architecture.mmd`](./system_architecture.mmd).

## Index

### Deployment
- [`docs/deployment.md`](./deployment.md): Compose layout, environment loading rules (`.env` at repo root only), production overrides, and Dockerfile boundaries.
- [`docs/INSTALL_LAVALINK.md`](./INSTALL_LAVALINK.md): Provisioning Lavalink nodes for local and production.
- [`docs/development.md`](./development.md): Local iteration workflow, codegen, and lint/test entry points.
- [`docs/local_sandbox.md`](./local_sandbox.md): Running a fully local stack (bot + control panel + Lavalink + MySQL/Redis).

### Runtime Overviews
- [`docs/frontend.md`](./frontend.md): Next.js control panel stack, dev workflow, tests, and deployment.
- [`docs/bot.md`](./bot.md): discord.py bot runtime, scenarios, metrics, and deployment.

### Operations
- [`docs/operations.md`](./operations.md): Day-2 runbook (rollouts, restarts, backups, queue-sync durability, monitoring hooks).
- [`docs/observability/metrics.md`](./observability/metrics.md): Metrics surface and scraping guidance.
- [`docs/grafana/README.md`](./grafana/README.md): Prebuilt Grafana dashboards for Lavalink and shard health.
- [`docs/security/threat-model.md`](./security/threat-model.md): Threat model and incident-response checkpoints.
- [`docs/queue_telemetry.md`](./queue_telemetry.md): Queue telemetry webhook modes, payloads, and redaction rules.
- [`docs/queue_sync.md`](./queue_sync.md): Queue snapshot publisher payloads, plan gating, and consumer guidance.
- [`docs/performance.md`](./performance.md): Load-testing notes and tuning levers.

### Troubleshooting
- [`docs/troubleshooting.md`](./troubleshooting.md): Fast triage for invite/authentication issues, Lavalink connectivity, queue-sync drift, and database migration failures.
- [`docs/backend/compliance-export-jobs.md`](./backend/compliance-export-jobs.md): Recovering stuck jobs and validating audit trails.
- [`docs/security/secure-coding-guidelines.md`](./security/secure-coding-guidelines.md): Patterns to keep fixes from regressing.

### Architecture & API Surface
- [`docs/architecture.md`](./architecture.md): A detailed overview of the VectoBeat architecture.
- [`docs/system_architecture.mmd`](./system_architecture.mmd): The source file for the main system architecture diagram.
- [`docs/command_reference.md`](./command_reference.md): Generated slash-command catalogue.
- [`docs/analytics.md`](./analytics.md): Dashboard metrics and export behaviours.
- [`docs/backend/queue-processing.md`](./backend/queue-processing.md): Control panel queue processing and persistence paths.
- [`docs/backend/regional-failover.md`](./backend/regional-failover.md): Multi-region behaviours and failover switches.

If you add a new guide, please link it here to ensure discoverability.
