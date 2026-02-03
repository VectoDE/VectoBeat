import test from "node:test"
import assert from "node:assert/strict"
import { createQueueStore } from "@/lib/queue-sync-store"
import type { QueueSnapshot } from "@/types/queue-sync"

const makeSnapshot = (guildId: string, updatedAt: string): QueueSnapshot => ({
  guildId,
  queue: [],
  nowPlaying: null,
  paused: false,
  volume: null,
  metadata: null,
  reason: "update",
  updatedAt,
})

test("concurrent writers do not clobber newer queue snapshots", async () => {
  let stored: any = null

  const sharedStore = createQueueStore({
    fetchTier: async () => "growth",
    load: async () => stored,
    persist: async (snapshot, tier, expiresAt) => {
      stored = { snapshot: { ...snapshot, tier } as any, expiresAt }
    },
    purge: async () => {},
    now: () => 0,
  })

  const older = makeSnapshot("g1", "2024-01-01T00:00:00.000Z")
  const newer = makeSnapshot("g1", "2024-01-02T00:00:00.000Z")

  // Simulate two workers updating at the same time.
  await Promise.all([sharedStore.setQueueSnapshot(older), sharedStore.setQueueSnapshot(newer)])

  assert(stored)
  assert.equal(stored!.snapshot.updatedAt, newer.updatedAt)
})
