import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createAnalyticsHandlers } from "@/app/api/dashboard/analytics/route"
import type { QueueSnapshot } from "@/types/queue-sync"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("dashboard analytics pulls queue snapshot from durable store", async () => {
  const fakeSnapshot: QueueSnapshot = {
    guildId: "g1",
    queue: [{ title: "Song", author: "Artist", duration: 120000, uri: null, artworkUrl: null, source: "yt", requester: null }],
    nowPlaying: null,
    paused: false,
    volume: 50,
    metadata: null,
    reason: "update",
    updatedAt: new Date(0).toISOString(),
  }

  const { GET } = createAnalyticsHandlers({
    verifyUser: async () => ({ valid: true, token: null, sessionHash: null }),
    fetchSubscriptions: async () => [{ discordServerId: "g1", status: "active", tier: "growth" } as any],
    fetchQueueSnapshot: async () => fakeSnapshot,
  })

  const response = await GET(buildRequest("https://vectobeat.test/api/dashboard/analytics?discordId=u1&guildId=g1"))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.analytics?.__guildId, "g1")
  assert.equal(body.analytics?.streamsData?.[0]?.value, 1)
})
