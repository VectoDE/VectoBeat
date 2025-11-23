import test from "node:test"
import assert from "node:assert/strict"
import { createQueueStore } from "@/lib/queue-sync-store"
import { createConciergeHandlers } from "@/app/api/concierge/route"
import { createApiTokenHandlers } from "@/app/api/control-panel/api-tokens/route"
import { NextRequest } from "next/server"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("queue-sync survives multiple writers with recency wins", async () => {
  let persisted: any = null
  const store = createQueueStore({
    fetchTier: async () => "growth",
    load: async () => persisted,
    persist: async (snapshot, tier, expiresAt) => {
      persisted = { snapshot, tier, expiresAt }
    },
    purge: async () => {},
  })

  const older = store.setQueueSnapshot({
    guildId: "g1",
    queue: [],
    nowPlaying: null,
    paused: false,
    volume: null,
    metadata: null,
    reason: "bulk",
    updatedAt: "2023-01-01T00:00:00.000Z",
  })
  const newer = store.setQueueSnapshot({
    guildId: "g1",
    queue: [],
    nowPlaying: null,
    paused: false,
    volume: null,
    metadata: null,
    reason: "live",
    updatedAt: "2023-02-01T00:00:00.000Z",
  })

  await Promise.all([older, newer])
  assert(persisted)
  assert.equal(persisted.snapshot.reason, "live")
})

test("concierge handles concurrent creation attempts", async () => {
  let saved = 0
  const saveRequest = async (payload: any) => {
    saved += 1
    return { id: `req-${saved}`, ...payload } as any
  }
  const { POST } = createConciergeHandlers({
    verifyUser: async () => ({ valid: true, token: "t", sessionHash: "h" }),
    fetchUserSubscriptions: async () => [{ discordServerId: "g1", status: "active", tier: "scale" }],
    fetchGuildTier: async () => "scale",
    fetchUsage: async () => ({ remaining: 10, total: 10, used: 0 }),
    saveRequest,
    fetchSettings: async () => ({} as any),
    notify: async () => {},
  })

  const payload = {
    guildId: "g1",
    discordId: "u1",
    summary: "help",
  }
  const res1 = await POST(
    buildRequest("https://vectobeat.test/api/concierge", { method: "POST", body: JSON.stringify(payload) }),
  )
  assert.equal(res1.status, 200)
  const res2 = await POST(
    buildRequest("https://vectobeat.test/api/concierge", { method: "POST", body: JSON.stringify(payload) }),
  )
  assert.equal(res2.status, 200)
  assert.equal(saved, 2)
})

test("rapid API token churn keeps actor metadata", async () => {
  let events: any[] = []
  let tokens: any[] = [
    {
      id: "t1",
      label: "prod",
      hash: "hash",
      lastFour: "1234",
      createdAt: new Date().toISOString(),
      scopes: [],
      status: "active",
      leakDetected: false,
    },
  ]
  const handlers = createApiTokenHandlers({
    verifyAccess: async () => ({
      ok: true,
      tier: "pro",
      subscription: { id: "s1", discordServerId: "g1", tier: "pro", status: "active" } as any,
      user: { id: "u1", username: "tester", email: "u@test" },
    }),
    fetchSettings: async () => ({ apiTokens: tokens }),
    saveSettings: async (_guildId, _discordId, payload) => {
      tokens = payload.apiTokens
    },
    recordEvent: async (payload) => {
      events.push(payload)
    },
    email: async () => {},
  })

  await Promise.all([
    handlers.PATCH(
      buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
        method: "PATCH",
        body: JSON.stringify({ guildId: "g1", discordId: "u1", tokenId: "t1", action: "rotate" }),
      }),
    ),
    handlers.PATCH(
      buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
        method: "PATCH",
        body: JSON.stringify({ guildId: "g1", discordId: "u1", tokenId: "t1", action: "mark_leak" }),
      }),
    ),
  ])

  assert(events.length >= 2)
  assert(events.every((e) => e.actorName === "tester"))
})
