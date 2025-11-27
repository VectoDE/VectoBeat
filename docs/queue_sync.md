# Queue Sync Publisher

VectoBeat can publish queue snapshots to the control panel for realtime dashboards, durable queue state, and analytics backfills. The payload includes now-playing metadata, queue contents (capped at 50), and simple player state.

## Configuration
```yaml
queue_sync:
  enabled: true
  endpoint: "https://panel.example.com/api/bot/queue-sync"
  api_key: "optional-bearer-token"
```

Environment variables (`QUEUE_SYNC_ENABLED`, `QUEUE_SYNC_ENDPOINT`, `QUEUE_SYNC_API_KEY`) override YAML values. Requests carry `Authorization: Bearer <api_key>` when provided and use a 5s timeout.

## Payload shape
```json
{
  "guildId": "123456789012345678",
  "updatedAt": "2024-05-12T14:22:01.123Z",
  "reason": "tracks_added",
  "metadata": {
    "tier": "pro",
    "syncMode": "realtime"
  },
  "nowPlaying": {
    "title": "Song Title",
    "author": "Artist",
    "duration": 210000,
    "uri": "https://youtu.be/abc123",
    "artworkUrl": "https://i.ytimg.com/…",
    "source": "youtube",
    "requester": "555555555555555555"
  },
  "queue": [
    { "title": "Next Track", "author": "Artist", "duration": 180000, "uri": "https://…" }
  ],
  "paused": false,
  "volume": 100
}
```

## Triggers & plan gating
- Snapshot publishing is allowed for tiers: `starter`, `pro`, `growth`, `scale`, `enterprise`.
- Realtime mode is enabled for `pro`+ plans; others receive periodic snapshots only.
- Reasons emitted today: `track_start`, `tracks_added`, `skip`, `stop`, `queue_remove`, `queue_clear`, `queue_shuffle`, `queue_move`, `playlist_load`, `queue_end`.

Consumers should treat payloads as idempotent and prefer the latest `updatedAt` per guild. If the endpoint returns `>=400`, the bot logs the failure but continues playback.
