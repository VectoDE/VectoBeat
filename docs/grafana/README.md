# Grafana Dashboards for VectoBeat

Import these dashboards into Grafana (v9+) to visualise the Prometheus metrics exposed by `MetricsService`.

## Usage
1. In Grafana, go to `Dashboards → Import`.
2. Upload the JSON file and select your Prometheus data source when prompted (or change the `datasource` template variable afterwards).
3. Ensure Prometheus is scraping the bot's `/metrics` endpoint so the panels populate.

## Dashboards
- `vectobeat-shard-command-overview.json` — shard latency, guild counts, active players, and slash command throughput.
- `vectobeat-lavalink-nodes.json` — Lavalink node availability, per-node player load, and queue depth.

Both dashboards include template variables so you can filter by shard or node without editing the JSON.
