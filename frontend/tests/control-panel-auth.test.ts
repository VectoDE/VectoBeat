import test from "node:test"
import assert from "node:assert/strict"
import type { NextRequest } from "next/server"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"
import type { SubscriptionSummary } from "@/lib/db"

const mockRequest = {} as NextRequest

const validVerification = {
  valid: true,
  token: "token",
  sessionHash: "hash",
  user: {
    id: "user-1",
    username: "tester",
    email: "test@example.com",
    displayName: "Tester",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    phone: null,
    guilds: [],
  },
}
const invalidVerification = { valid: false, token: null, sessionHash: null, user: null }

const buildSubscription = (overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
  id: overrides.id ?? "sub",
  discordId: overrides.discordId ?? "user-1",
  discordServerId: overrides.discordServerId ?? "guild-1",
  name: overrides.name ?? "Guild Alpha",
  tier: overrides.tier ?? "starter",
  status: overrides.status ?? "active",
  stripeCustomerId: overrides.stripeCustomerId ?? null,
  pricePerMonth: overrides.pricePerMonth ?? 10,
  currentPeriodStart: overrides.currentPeriodStart ?? new Date().toISOString(),
  currentPeriodEnd: overrides.currentPeriodEnd ?? new Date().toISOString(),
})

test("verifyControlPanelGuildAccess rejects invalid sessions", async () => {
  const result = await verifyControlPanelGuildAccess(mockRequest, "user-1", "guild-1", {
    verifyUser: async () => invalidVerification,
    fetchSubscriptions: async () => [],
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
    assert.equal(result.code, "unauthorized")
  }
})

test("verifyControlPanelGuildAccess blocks cross-tenant access", async () => {
  const result = await verifyControlPanelGuildAccess(mockRequest, "user-1", "guild-2", {
    verifyUser: async () => validVerification,
    fetchSubscriptions: async () => [buildSubscription({ discordServerId: "guild-1" })],
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 403)
    assert.equal(result.code, "guild_not_accessible")
  }
})

test("verifyControlPanelGuildAccess returns membership details when authorized", async () => {
  const subscription = buildSubscription({ discordServerId: "guild-1", tier: "enterprise" })
  const result = await verifyControlPanelGuildAccess(mockRequest, "user-1", "guild-1", {
    verifyUser: async () => validVerification,
    fetchSubscriptions: async () => [subscription],
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.tier, "enterprise")
    assert.equal(result.subscription.id, subscription.id)
    assert.equal(result.subscription.discordServerId, "guild-1")
    assert.equal(result.user?.id, "user-1")
  }
})
