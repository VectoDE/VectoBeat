import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createServerSettingsHandlers } from "@/app/api/control-panel/server-settings/route"
import { createConciergeHandlers } from "@/app/api/concierge/route"
import { createSuccessPodHandlers } from "@/app/api/success-pod/route"
import { createApiTokenHandlers } from "@/app/api/control-panel/api-tokens/route"
import { createSecurityAuditHandlers } from "@/app/api/control-panel/security/audit/route"
import { createAnalyticsExportHandlers } from "@/app/api/analytics/export/route"
import { defaultServerFeatureSettings } from "@/lib/server-settings"
import type { QueueSnapshot } from "@/types/queue-sync"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("control-panel server settings returns tiered settings", async () => {
  const handlers = createServerSettingsHandlers({
    verifyAccess: async () => ({
      ok: true,
      tier: "pro",
      subscription: { id: "s1", discordServerId: "g1" } as any,
      user: {
        id: "u1",
        username: "tester",
        email: "u@test.tld",
        displayName: "Tester",
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        phone: null,
        guilds: [],
      },
    }),
  })
  const res = await handlers.GET(
    buildRequest("https://vectobeat.test/api/control-panel/server-settings?guildId=g1&discordId=u1"),
  )
  assert.equal(res.status, 200)
})

test("concierge denies when guild not accessible", async () => {
  const { GET } = createConciergeHandlers({
    verifyUser: async () => ({ valid: true, token: "t", sessionHash: "h", user: null }),
    fetchUserSubscriptions: async () => [],
    fetchGuildTier: async () => "growth",
  })
  const res = await GET(buildRequest("https://vectobeat.test/api/concierge?guildId=g1&discordId=u1"))
  assert.equal(res.status, 403)
})

test("success pod creation uses plan gate and returns request", async () => {
  const { POST } = createSuccessPodHandlers({
    verifyUser: async () => ({ valid: true, token: "t", sessionHash: "h", user: null }),
    fetchTier: async () => "scale",
    saveRequest: async (payload) => ({ id: "req1", ...payload } as any),
    mail: async () => ({ delivered: true }),
  })
  const res = await POST(
    buildRequest("https://vectobeat.test/api/success-pod", {
      method: "POST",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", summary: "help", contact: "me", guildName: "G" }),
    }),
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.request.id, "req1")
})

test("API token leak marker logs actor", async () => {
  const events: any[] = []
  const handlers = createApiTokenHandlers({
    verifyAccess: async () => ({
      ok: true as const,
      tier: "pro" as const,
      subscription: { id: "s1", discordServerId: "g1", tier: "pro", status: "active" } as any,
      user: {
        id: "u1",
        username: "tester",
        email: "u@test.tld",
        displayName: "Tester",
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        phone: null,
        guilds: [] as any[],
      },
    }),
    fetchSettings: async () => ({
      ...defaultServerFeatureSettings,
      apiTokens: [
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
      ],
    }),
    saveSettings: async (_g, _d, updates) => ({ ...defaultServerFeatureSettings, ...updates }),
    recordEvent: async (payload) => {
      events.push(payload)
    },
    email: async () => ({ delivered: true }),
  })

  const res = await handlers.PATCH(
    buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
      method: "PATCH",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", tokenId: "t1", action: "mark_leak" }),
    }),
  )
  assert.equal(res.status, 200)
  const event = events.find((e) => e.action === "mark_leak")
  assert.equal(event.actorName, "tester")
})

test("security audit export respects plan gate", async () => {
  const { GET } = createSecurityAuditHandlers({
    verifyAccess: async () => ({
      ok: true,
      tier: "free",
      subscription: { id: "s1", discordServerId: "g1", tier: "free", status: "active" } as any,
      user: null,
    }),
    fetchEvents: async () => [],
  })
  const res = await GET(buildRequest("https://vectobeat.test/api/control-panel/security/audit?guildId=g1&discordId=u1"))
  assert.equal(res.status, 403)
})

test("analytics export requires predictive analytics", async () => {
  const { GET } = createAnalyticsExportHandlers({
    verifyUser: async () => ({ valid: true, token: "t", sessionHash: "h", user: null }),
    fetchSubscriptions: async () => [{ discordServerId: "g1", status: "active", tier: "starter" } as any],
  })
  const res = await GET(buildRequest("https://vectobeat.test/api/analytics/export?discordId=u1&guildId=g1"))
  assert.equal(res.status, 403)
})

