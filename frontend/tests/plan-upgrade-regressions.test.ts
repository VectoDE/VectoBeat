import test from "node:test"
import assert from "node:assert/strict"
import { provisionDefaultsForTier } from "@/lib/db"
import { sanitizeSettingsForTier } from "@/app/api/bot/server-settings/route"
import { defaultServerFeatureSettings, ServerFeatureSettings } from "@/lib/server-settings"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"

const TIER_SEQUENCE: MembershipTier[] = ["free", "starter", "pro", "growth", "scale", "enterprise"]

test("plan upgrades provision expected defaults and quotas", () => {
  let current = provisionDefaultsForTier(null, "free")
  let previousQueue = current.queueLimit

  for (const tier of TIER_SEQUENCE.slice(1)) {
    current = provisionDefaultsForTier(current, tier)
    const plan = getPlanCapabilities(tier)
    assert.equal(current.multiSourceStreaming, plan.serverSettings.multiSourceStreaming, `${tier} multi-source mismatch`)
    assert.equal(current.playlistSync, plan.serverSettings.playlistSync, `${tier} playlist sync mismatch`)
    assert.equal(current.aiRecommendations, plan.serverSettings.aiRecommendations, `${tier} AI recommendations mismatch`)
    assert.equal(current.exportWebhooks, plan.serverSettings.exportWebhooks, `${tier} webhook export mismatch`)
    assert.equal(current.sourceAccessLevel, plan.serverSettings.maxSourceAccessLevel, `${tier} source level mismatch`)
    assert.equal(current.playbackQuality, plan.serverSettings.maxPlaybackQuality, `${tier} playback mismatch`)
    assert.equal(current.automationLevel, plan.serverSettings.maxAutomationLevel, `${tier} automation gate mismatch`)

    if (typeof plan.limits.queue === "number") {
      assert.equal(
        current.queueLimit,
        plan.limits.queue,
        `${tier} queue cap should equal plan quota`,
      )
    } else {
      assert.ok(
        current.queueLimit >= previousQueue,
        `${tier} queue cap should stay monotonic when plan is unlimited`,
      )
    }
    previousQueue = current.queueLimit
  }
})

test("plan downgrades clamp quotas and UI gates to tier policies", () => {
  const optimisticSettings = {
    ...defaultServerFeatureSettings,
    queueLimit: 50_000,
    multiSourceStreaming: true,
    playlistSync: true,
    aiRecommendations: true,
    automationLevel: "full" as const,
    analyticsMode: "predictive" as const,
    playbackQuality: "hires" as const,
    sourceAccessLevel: "unlimited" as const,
    exportWebhooks: true,
  }

  const downgradePath: MembershipTier[] = ["scale", "growth", "pro", "starter", "free"]
  let current: ServerFeatureSettings = optimisticSettings

  for (const tier of downgradePath) {
    const plan = getPlanCapabilities(tier)
    current = sanitizeSettingsForTier(current, tier)
    assert.equal(current.multiSourceStreaming, plan.serverSettings.multiSourceStreaming, `${tier} multi-source mismatch`)
    assert.equal(current.playlistSync, plan.serverSettings.playlistSync, `${tier} playlist mismatch`)
    assert.equal(current.aiRecommendations, plan.serverSettings.aiRecommendations, `${tier} AI gate mismatch`)
    assert.equal(current.exportWebhooks, plan.serverSettings.exportWebhooks, `${tier} export gate mismatch`)
    assert.equal(current.sourceAccessLevel, plan.serverSettings.maxSourceAccessLevel, `${tier} source level mismatch`)
    assert.equal(current.playbackQuality, plan.serverSettings.maxPlaybackQuality, `${tier} playback mismatch`)
    assert.equal(current.analyticsMode, plan.serverSettings.maxAnalyticsMode, `${tier} analytics mismatch`)
    assert.equal(current.automationLevel, plan.serverSettings.maxAutomationLevel, `${tier} automation mismatch`)

    if (typeof plan.limits.queue === "number") {
      assert.equal(current.queueLimit, plan.limits.queue, `${tier} queue cap should match plan limit`)
    } else {
      assert.ok(current.queueLimit >= 0, `${tier} queue cap should remain non-negative`)
    }
  }
})
