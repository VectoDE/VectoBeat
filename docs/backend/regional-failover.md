# Regional Failover Strategies (Lavalink & Bot Shards)

Enterprise plans expect resilient playback even when a region degrades. This runbook documents how VectoBeat handles regional failover across Lavalink clusters and bot shards, complete with health checks and alarming.

## 1. Components

| Component | Purpose |
|-----------|---------|
| `RegionalRoutingService` (bot) | Applies plan-aware routing (US/EU/APAC) and clamps invalid selections. |
| `scripts/lavalink-failover-check.mjs` | Scheduled worker that polls Lavalink `/metrics` endpoints, updates routing tables, and raises alarms. |
| AutoShardedBot supervisor | Monitors shard heartbeats, promotes hot spares if a shard stops responding. |
| Control panel regional panel (`/api/control-panel/lavalink/nodes`) | Surfaces node health + failover status to customers. |

## 2. Lavalink Failover

1. **Health Monitoring**: Each Lavalink node exposes `/metrics`. The failover checker hits the endpoint, checks response time/status, and writes health to Redis + emits alarms (PagerDuty/Discord) if nodes are degraded.
2. **Route 53 Health Checks**: DNS records per region include primary + secondary nodes. When a health check fails, Route 53 drains traffic to the failed node automatically.
3. **Bot Reaction**:
   - The bot caches node health via the Status API. When the primary node is unhealthy, RegionalRoutingService reassigns active players to the healthy node in the same region (or fails over to `auto` if the entire region fails).
   - Queue snapshots in Redis ensure migration does not drop playback.
4. **Control Panel Visibility**: `/api/control-panel/lavalink/nodes` now shows per-node status (`available`, `players`, `region`), enabling admins to see failover events from the UI.

## 3. Bot Shard Failover

1. **Heartbeat Monitoring**: AutoShardedBot monitors per-shard heartbeats. If a heartbeat stalls for >60s, the supervisor triggers a promotion.
2. **Hot Spares**: Run at least one spare shard per region (k8s deployment or PM2 process). When promotion occurs, the spare claims the shard ID and begins replaying events.
3. **Audit Trail**: Promotions emit `shard_failover` events into the Security & Compliance Desk so customers and SREs have provenance.

## 4. Failover Checker Script

Path: `scripts/lavalink-failover-check.mjs`

Key duties:
- Poll list of Lavalink node URLs (provided via env or service discovery).
- Update Redis keys (`lavalink:health:<node>`) with latency + status.
- Trigger webhooks (PagerDuty, Slack, Discord) when latency/availability crosses thresholds.
- Optionally call `/api/control-panel/lavalink/reconcile` to prompt the control panel UI to refresh status.

Environment variables:

| Variable | Description |
|----------|-------------|
| `LAVALINK_NODES` | Comma-separated list of `region:name:url` entries. |
| `LAVALINK_HEALTH_WEBHOOK` | Webhook to notify on degraded nodes. |
| `QUEUE_REDIS_URL` | Redis connection string for writing health state (shared with the bot). |

## 5. Dashboards & Alerts

- **Grafana**: Dashboards under `docs/grafana/vectobeat-lavalink-nodes.json` visualize node availability, player counts, and failovers.
- **PagerDuty/Discord**: Webhooks triggered by the failover checker deliver region + node metadata so on-call can page the right team.

## 6. Checklist for New Regions

1. Provision at least two Lavalink nodes in the region.
2. Add Route 53 health checks and integrate them with DNS records.
3. Update `LAVALINK_NODES` env for the failover checker + bot.
4. Update plan capability (if region is plan-scoped) and the control panel UI options.
5. Run chaos tests (drain nodes, kill shards) and confirm the worker emits alarms and the bot fails over cleanly.

Document owner: **Runtime Engineering** — update when adding regions or changing the failover mechanism.
