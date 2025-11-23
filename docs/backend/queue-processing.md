# Queue-Based Processing for Long-Running Operations

VectoBeat offloads expensive workflows—analytics exports, embed override propagation, concierge escalations—into Redis-backed job queues. This keeps API responses fast and aligns with enterprise customers’ expectations around repeatable, observable background processing.

## 1. Architecture Overview

```
Client / API → Job Producer (Next.js API Route)
                    ↓
            Redis-backed queue (BullMQ-compatible)
                    ↓
           Worker (scripts/job-queue-worker.mjs)
                    ↓
     Analytics export pipeline / Embed override fan-out
```

- **Producers**: API routes such as `/api/control-panel/analytics/export` and `/api/control-panel/domain-branding` enqueue jobs instead of doing all work inline. Payloads include guild ID, actor, correlation ID, and the specific action (export analytics, propagate embed overrides).
- **Queue**: We rely on Redis (already present for playlist persistence) as the queue backend. Jobs are namespaced per workflow (`analytics-export`, `embed-overrides`), with retry/delay policies tuned per job type.
- **Worker**: A dedicated Node.js worker (`scripts/job-queue-worker.mjs`) pulls jobs, executes the workflow (calling the existing control-panel APIs or bot webhooks), and writes structured logs + completion events back to Redis/MySQL.

## 2. Worker Script

Path: `scripts/job-queue-worker.mjs`

Capabilities:

1. Connects to Redis via environment variables (`QUEUE_REDIS_URL`, `QUEUE_NAMESPACE`).
2. Subscribes to `analytics-export` jobs and calls the compliance export API to stream JSONL/CSV into the customer’s storage bucket (reusing the compliance export job under the hood).
3. Handles `embed-overrides` jobs by fetching the latest server settings, applying the embed overrides snapshot, and calling the bot webhook (`/api/bot/branding/apply`) to fan-out changes across shards.
4. Emits structured logs with correlation IDs so auditors can map queue jobs back to control-panel actions.
5. Supports scheduled retries, exponential back-off, and DLQ forwarding for failed jobs (configurable via env).

*The worker uses BullMQ-style semantics (delayed jobs, concurrency controls). If you already run Redis for queue telemetry, no extra infrastructure is required.*

## 3. Enqueuing Jobs

### Analytics Exports

1. Control panel button “Generate analytics export” triggers a POST to `/api/control-panel/analytics/export`.
2. The route performs lightweight validation, then enqueues a job:

```ts
await queue.add("analytics-export", {
  guildId,
  exportType: body.type ?? "standard",
  actorId: discordId,
  actorName: verification.user?.displayName ?? verification.user?.username,
})
```

3. Worker picks up the job, streams data via `/api/control-panel/compliance/export`, encrypts it, and delivers it via S3/SFTP (same logic as `scripts/compliance-export-job.mjs`).
4. Completion events are written to the audit log so the Security & Compliance Desk shows progress/history.

### Embed Overrides Propagation

1. When a user saves embed overrides in the branding panel, the API route enqueues an `embed-overrides` job per guild.
2. The worker fetches the latest settings via `/api/control-panel/server-settings`, generates a branding snapshot, and calls bot-side endpoints (`/api/bot/server-settings/route.ts`) to push updates across shards.
3. Workers retry automatically on transient errors (Discord outage, network blips) without blocking the UI.

## 4. Observability & Operations

- Metrics: queue depth, job processing time, failure counts, retries.
- Logs: each job includes `correlationId` tying it to user actions (persisted in MySQL).
- DLQ: jobs failing more than `QUEUE_MAX_ATTEMPTS` are moved to a dead-letter set so SREs can inspect payloads.
- Scaling: run multiple worker replicas to increase throughput; workers are stateless and can be deployed on the same fleet as the control panel.

## 5. Configuration Cheat Sheet

| Env Var | Description |
|---------|-------------|
| `QUEUE_REDIS_URL` | Redis connection string (`redis://user:pass@host:port/0`). |
| `QUEUE_NAMESPACE` | Namespace/prefix for analytics + embed jobs (default: `vectobeat`). |
| `QUEUE_MAX_ATTEMPTS` | Retry attempts before DLQ (default: 5). |
| `QUEUE_CONCURRENCY_ANALYTICS` | Number of concurrent analytics export jobs. |
| `QUEUE_CONCURRENCY_EMBED` | Number of concurrent embed override jobs. |
| `QUEUE_DLQ_WEBHOOK` | Optional webhook to notify when jobs land in DLQ. |

## 6. Benefits

- Keeps API response times low—no more multi-second waits for analytics exports or embed fan-out.
- Centralised logging/telemetry for long-running tasks.
- Natural place to enforce back-pressure, retries, and encryption policies.

Document owner: **Backend Platform Team** — update whenever new long-running workflows (e.g., billing sync, concierge escalations) move onto the queue.
