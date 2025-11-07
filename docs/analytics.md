# Command Analytics Pipeline

VectoBeat ships with an opt-in command analytics exporter that streams anonymised
slash command events into your own data warehouse or a local log for later ETL.

## Configuration
Add the `analytics` block in `config.yml` (defaults shown):

```yamlanalytics:
  enabled: true
  endpoint: "https://warehouse.example.com/v1/events"
  api_key: "super-secret"
  flush_interval_seconds: 30
  batch_size: 100
  storage_path: "data/command_analytics.log"
  hash_salt: "vectobeat"
```

* If `endpoint` is set, events are batched and delivered as JSON via HTTP POST.
* If `endpoint` is empty, events are appended as NDJSON to `storage_path`.
* `hash_salt` is used to derive deterministic, non-reversible user hashes.

Environment variables (e.g. `ANALYTICS_ENDPOINT`) override the YAML values,
matching the fields in `src/configs/settings.py`.

## Event schema
Each event follows this shape:

```json
{
  "ts": 1700000000,
  "command": "queue clear",
  "success": true,
  "duration_ms": 523.1,
  "guild_id": 123456789012345678,
  "shard_id": 2,
  "user_hash": "9b410c1d81b1d5b43c1f3f52a4a1e413",
  "meta": { "error": "MissingPermissions" }
}
```

`meta` only appears on failures, exposing the error class without leaking stack
traces. All personally identifiable information is replaced with one-way hashes.

## Wiring
The `ObservabilityEvents` cog automatically records completion/error events and
pushes them into `CommandAnalyticsService`. As long as analytics are enabled,
no additional setup is necessary.
