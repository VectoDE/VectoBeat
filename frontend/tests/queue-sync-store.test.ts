import test from "node:test"
import assert from "node:assert/strict"
import { createQueueStore } from "@/lib/queue-sync-store"
import type { QueueSnapshot } from "@/types/queue-sync"

const baseSnapshot: QueueSnapshot = {
  guildId: "g1",
  queue: [],
  nowPlaying: null,
  paused: false,
  volume: null,
  metadata: null,
  reason: undefined,
  updatedAt: new Date(0).toISOString(),
}

test("queue store persists with tier-based TTL", async () => {
  let persisted: { snapshot: QueueSnapshot; expiresAt: Date | null; tier: string } | null = null
  const store = createQueueStore({
    fetchTier: async () => "growth",
    persist: async (snapshot, tier, expiresAt) => {
      persisted = { snapshot, expiresAt, tier }
    },
    load: async () => null,
    purge: async () => {},
    now: () => 0,
  })

  await store.setQueueSnapshot(baseSnapshot)
  assert(persisted)
  assert.equal(persisted?.tier, "growth")
  assert.equal(persisted?.expiresAt?.getTime(), 60 * 60 * 1000) // 60 minutes
})

test("queue store evicts expired snapshots", async () => {
  let purged = false
  const store = createQueueStore({
    fetchTier: async () => "growth",
    persist: async () => {},
    load: async (): Promise<{ snapshot: QueueSnapshot; expiresAt: Date | null } | null> => ({
      snapshot: baseSnapshot,
      expiresAt: new Date(-1000),
    }),
    purge: async () => {
      purged = true
    },
    now: () => 0,
  })

  const snapshot = await store.getQueueSnapshot("g1")
  assert.equal(snapshot, null)
  assert.equal(purged, true)
})
