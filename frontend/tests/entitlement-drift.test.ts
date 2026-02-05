import test from "node:test"
import assert from "node:assert/strict"
import { defaultServerFeatureSettings } from "@/lib/server-settings"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { evaluateEntitlementDrift } from "@/lib/entitlement-drift"

test("detects queue sync underutilization and automation exceedance", () => {
  const plan = getPlanCapabilities("growth")
  const findings = evaluateEntitlementDrift({
    guildId: "123",
    tier: "growth",
    plan,
    settings: {
      ...defaultServerFeatureSettings,
      playlistSync: false,
      automationLevel: "off",
      multiSourceStreaming: true,
      aiRecommendations: true,
      exportWebhooks: true,
      sourceAccessLevel: "unlimited",
      playbackQuality: "hires",
      analyticsMode: "basic",
    },
  })
  const queueSync = findings.find((finding) => finding.field === "queue_sync")
  assert.ok(queueSync)
  assert.equal(queueSync?.severity, "underutilized")
  const automation = findings.find((finding) => finding.field === "automation_level")
  assert.ok(automation)
  assert.equal(automation?.severity, "underutilized")
})

test("flags entitlement exceedance for free guild with queue sync and API tokens", () => {
  const plan = getPlanCapabilities("free")
  const findings = evaluateEntitlementDrift({
    guildId: "free-1",
    tier: "free",
    plan,
    settings: {
      ...defaultServerFeatureSettings,
      playlistSync: true,
      automationLevel: "smart",
      multiSourceStreaming: true,
      aiRecommendations: true,
      exportWebhooks: true,
      apiTokens: [
        {
          id: "tok",
          label: "bot",
          hash: "hash",
          lastFour: "abcd",
          createdAt: new Date().toISOString(),
          scopes: ["queue.read"],
          status: "active",
          leakDetected: false,
        },
      ],
    },
  })
  const queueSync = findings.find((finding) => finding.field === "queue_sync")
  assert.ok(queueSync)
  assert.equal(queueSync?.severity, "exceeds")
  const apiTokens = findings.find((finding) => finding.field === "api_tokens")
  assert.ok(apiTokens)
  assert.equal(apiTokens?.severity, "exceeds")
})
