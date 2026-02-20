import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createConciergeHandlers } from "@/app/api/concierge/route"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))
const invalidVerifier = async () => ({ valid: false, token: null, sessionHash: null, user: null })
const validVerifier = async () => ({
  valid: true,
  token: "t",
  sessionHash: "h",
  user: {
    id: "u1",
    username: "tester",
    email: "test@example.com",
    displayName: "Tester",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    phone: null,
    guilds: [],
  },
})
const failIfCalled = () => {
  throw new Error("should not be called")
}

test("concierge GET requires valid session", async () => {
  const { GET } = createConciergeHandlers({
    verifyUser: invalidVerifier,
    fetchUserSubscriptions: failIfCalled,
  })
  const response = await GET(buildRequest("https://vectobeat.test/api/concierge?guildId=g1&discordId=u1"))
  assert.equal(response.status, 401)
})

test("concierge GET blocks users without an active subscription for the guild", async () => {
  const { GET } = createConciergeHandlers({
    verifyUser: validVerifier,
    fetchUserSubscriptions: async () => [],
    fetchUsage: failIfCalled,
  })
  const response = await GET(buildRequest("https://vectobeat.test/api/concierge?guildId=g1&discordId=u1"))
  assert.equal(response.status, 403)
})

test("concierge POST requires valid session", async () => {
  const { POST } = createConciergeHandlers({
    verifyUser: invalidVerifier,
    fetchUserSubscriptions: failIfCalled,
  })
  const response = await POST(
    buildRequest("https://vectobeat.test/api/concierge", {
      method: "POST",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", summary: "help" }),
    }),
  )
  assert.equal(response.status, 401)
})

test("concierge POST blocks users without an active subscription", async () => {
  const { POST } = createConciergeHandlers({
    verifyUser: validVerifier,
    fetchUserSubscriptions: async () => [],
    fetchUsage: failIfCalled,
    saveRequest: failIfCalled,
    notify: failIfCalled,
  })
  const response = await POST(
    buildRequest("https://vectobeat.test/api/concierge", {
      method: "POST",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", summary: "help" }),
    }),
  )
  assert.equal(response.status, 403)
})

test("concierge POST uses subscription tier for limits", async () => {
  let recordedHours = 0
  let sentHtml = ""
  const { POST } = createConciergeHandlers({
    verifyUser: validVerifier,
    fetchUserSubscriptions: async () => [
      {
        discordServerId: "g1",
        status: "active",
        tier: "growth",
      } as any,
    ],
    fetchUsage: async () => ({ remaining: 2, total: 2, used: 0 }),
    saveRequest: async ({ hours }) => {
      recordedHours = hours ?? 0
      return { id: "req-1" } as any
    },
    fetchSettings: async () => ({} as any),
    notify: async ({ html }) => {
      sentHtml = html
      return { delivered: true, reason: "sent" }
    },
    fetchGuildTier: async () => "starter",
  })

  const response = await POST(
    buildRequest("https://vectobeat.test/api/concierge", {
      method: "POST",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", summary: "help please", hours: 2 }),
    }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(recordedHours, 2)
  assert.equal(payload.requestId, "req-1")
  assert(sentHtml.includes("req-1"))
})
