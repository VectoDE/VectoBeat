# Expanded Metrics Coverage (Observability & Reliability)

This guide outlines the telemetry shipped across the control panel, bot, and supporting services. Metrics are exported via the Status API, Prometheus `/metrics`, and Grafana dashboards stored under `docs/grafana`. The focus areas are shard load, Lavalink health, automation success, API error budgets, and concierge SLA adherence.

## 1. Shard Load

| Metric | Source | Description |
|--------|--------|-------------|
| `vectobeat_shard_guilds{shard_id, region}` | Bot `/metrics` | Number of guilds per shard, emitted every 30s. |
| `vectobeat_shard_latency_ms{shard_id}` | Bot `/metrics` | Gateway heartbeat latency, used to detect stalls. |
| `vectobeat_shard_failover_total` | Bot `/metrics` | Counter incremented when AutoShardedBot promotes a hot spare. |

These feed the “Shard Load & Health” Grafana panel and trigger alerts if latency > 250ms or guild count deviates >20% from average.

## 2. Lavalink Node Health

| Metric | Source | Description |
|--------|--------|-------------|
| `lavalink_node_players{region, node}` | `scripts/lavalink-failover-check.mjs` (via Redis + Prometheus exporter) | Current active players per node. |
| `lavalink_node_latency_ms{region, node}` | Failover checker | Latency to `/metrics` endpoint; alerts fire > 500ms. |
| `lavalink_node_health{region, node}` | Failover checker | 1 = healthy, 0 = failed. |

Control panel panel `/api/control-panel/lavalink/nodes` consumes the same data so customers see failures immediately.

## 3. Automation Success

| Metric | Source | Description |
|--------|--------|-------------|
| `automation_actions_total{action}` | `/api/bot/automation-actions` ingestion → Prometheus | Counts queue trims, auto restarts, throttled commands. |
| `automation_actions_failed_total{action}` | Bot automation audit service | Incremented when an automation action throws. Alerts on failure ratio > 5%. |
| `automation_job_duration_ms{action}` | Automation worker instrumentation | Histogram measuring automation job latency. |

These metrics back the Compliance Desk audit charts and Slack alerts for automation regressions.

## 4. API Error Budgets

| Metric | Source | Description |
|--------|--------|-------------|
| `api_requests_total{route,status}` | Next.js middleware (custom metrics hook) | Request volumes per API route. |
| `api_errors_total{route}` | Same | Any 5xx increments this counter. |
| `api_error_budget_remaining{route}` | Calculated in Grafana | 30-day rolling error budget (1 - error_rate). |

Alerts fire when error budget remaining drops below 80% for critical routes (control panel server settings, analytics export, compliance endpoints).

## 5. Concierge SLA Adherence

| Metric | Source | Description |
|--------|--------|-------------|
| `concierge_requests_total{status}` | `/api/concierge` ingestion → MySQL + exporters | Number of concierge tickets per status (open, acknowledged, resolved). |
| `concierge_sla_violation_total` | Success pod workflow | Counts tickets resolved after SLA window. |
| `concierge_response_time_ms` | Success pod workflow | Histogram from submission to acknowledgement. |

These metrics back the Account Manager panel and feed PagerDuty if SLA violation count exceeds thresholds.

## Dashboards & Alerts

- **Grafana**: Import dashboards under `docs/grafana/` (e.g., `vectobeat-shard-command-overview.json`, `vectobeat-lavalink-nodes.json`). They already visualize the metrics described here.
- **Alerting**: Prometheus alert rules (not in repo) should align with:
  - Shard latency > 250ms (critical).
  - Lavalink node health = 0 for > 1 minute (critical).
  - Automation failure ratio > 5% (warning).
  - API error budget remaining < 80% (warning) / < 60% (critical).
  - Concierge SLA violations > 0 in last hour (warning).

Document owner: **Observability Team** — update whenever new services or SLIs are added.
