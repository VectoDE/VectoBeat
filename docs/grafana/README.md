# Grafana Dashboards for VectoBeat

Import these dashboards into Grafana (v9+) to visualise the Prometheus metrics exposed by the bot MetricsService, Lavalink, and queue-sync analytics.

## Usage
1. In Grafana, go to `Dashboards → Import`.
2. Upload the JSON file and select your Prometheus data source when prompted (or change the `datasource` template variable afterwards).
3. Ensure Prometheus is scraping the bot's `/metrics` endpoint, Lavalink metrics, and any queue-sync counters.

## Dashboards
- `vectobeat-shard-command-overview.json` — shard latency, guild counts, active players, and slash command throughput.
- `vectobeat-lavalink-nodes.json` — Lavalink node availability, per-node player load, frame deficit, CPU/memory, and REST/socket error rates.
- `vectobeat-queue-health.json` — queue-sync durability, snapshot staleness, enqueue/dequeue rates, and analytics export timings.

Template variables let you filter by datasource, shard, node, or guild.

## Prometheus scrape hints
- Bot metrics: scrape `http://bot:3052/metrics` (or your deployed host) with <60s interval.
- Lavalink metrics: enable Prometheus in `lavalink/application.yml` and scrape the exposed port.
- Queue sync metrics: ensure the frontend pushes queue-sync counters to Prometheus via your sidecar/agent.
