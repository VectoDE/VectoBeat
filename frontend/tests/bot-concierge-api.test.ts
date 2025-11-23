import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createBotConciergeHandlers } from "@/app/api/bot/concierge/route"
import type { MembershipTier } from "@/lib/memberships"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

const SECRET = "concierge-secret"

const growthPlanUsage = { remaining: 2, total: 2, used: 0 }

test("bot concierge blocks unauthorized callers", async () => {
  const { GET } = createBotConciergeHandlers({ secret: SECRET })
  const response = await GET(buildRequest("https://vectobeat.test/api/bot/concierge?action=usage&guildId=g1"))
  assert.equal(response.status, 401)
})

test("bot concierge returns usage for authorized caller", async () => {
  const { GET } = createBotConciergeHandlers({
    secret: SECRET,
    fetchTier: async () => "growth" as MembershipTier,
    fetchUsage: async () => growthPlanUsage,
  })
  const response = await GET(
    buildRequest("https://vectobeat.test/api/bot/concierge?action=usage&guildId=g1", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.usage, growthPlanUsage)
})

test("bot concierge create enforces quota and returns usage", async () => {
  let savedHours = 0
  const { POST } = createBotConciergeHandlers({
    secret: SECRET,
    fetchTier: async () => "growth" as MembershipTier,
    fetchUsage: async () => growthPlanUsage,
    saveRequest: async (payload) => {
      savedHours = payload.hours ?? 0
      return { id: "req-1" } as any
    },
  })
  const response = await POST(
    buildRequest("https://vectobeat.test/api/bot/concierge", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        action: "create",
        guildId: "g1",
        summary: "Need help",
        hours: 5,
      }),
    }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.requestId, "req-1")
  assert.equal(savedHours, 2) // clamped to plan quota
})

test("bot concierge resolve updates requests", async () => {
  let resolved = false
  const { POST } = createBotConciergeHandlers({
    secret: SECRET,
    fetchTier: async () => "growth" as MembershipTier,
    fetchUsage: async () => growthPlanUsage,
    markResolved: async ({ note }) => {
      resolved = true
      assert.equal(note, "done")
      return true
    },
  })
  const response = await POST(
    buildRequest("https://vectobeat.test/api/bot/concierge", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        action: "resolve",
        guildId: "g1",
        requestId: "req-123",
        note: "done",
      }),
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.requestId, "req-123")
  assert.equal(resolved, true)
})
