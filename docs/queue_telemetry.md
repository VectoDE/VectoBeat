# Queue Telemetry Webhook

VectoBeat can emit real-time queue lifecycle events (play, skip, finish) to an external webhook so dashboards or bots can reflect the current playback state.

## Configuration
```
queue_telemetry:
  enabled: true
  endpoint: "https://webhook.example.com/vecto"
  api_key: "optional-shared-secret"
  include_guild_metadata: true
```

Environment variables (`QUEUE_TELEMETRY_ENABLED`, `QUEUE_TELEMETRY_ENDPOINT`, `QUEUE_TELEMETRY_API_KEY`, `QUEUE_TELEMETRY_INCLUDE_GUILD`) override YAML values. When `include_guild_metadata` is `true`, `guild_id` and `shard_id` will be set on each payload; disable this if you want to anonymise guild identifiers.

## Payloads
Every request is a JSON document with this envelope:

```json
{
  "ts": 1700000000,
  "event": "play",
  "guild_id": 123456789012345678,
  "shard_id": 0,
  "data": {
    "track": {
      "title": "Song Title",
      "author": "Artist",
      "identifier": "yt-abc123",
      "uri": "https://youtu.be/abc123",
      "duration": 210000,
      "requester": 555555555555555555
    },
    "actor_id": 222222222222222222,
    "queue_length": 6,
    "queue_duration_ms": 534000
  }
}
```

`event` values you can expect:
- `play` — dispatched when a track starts playing.
- `skip` — dispatched after `/skip`, including the actor id.
- `queue_finished` — emitted when the queue is exhausted (no autoplay).

## Analytics modes & filters
- The analytics mode comes from the control panel server settings (`analyticsMode`): `basic` redacts most fields, `advanced` sends full payloads, and `predictive` adds hints (remaining tracks, projected idle seconds).
- Webhook preferences (enabled + allowed events) are fetched from the control panel and cached for 5 minutes per guild.
- All payloads are sent sequentially; return 2xx responses to keep the pipeline healthy. Non-2xx responses are logged for operators to review.
