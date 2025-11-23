import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeSettingsForTier } from "@/app/api/bot/server-settings/route"
import { defaultServerFeatureSettings } from "@/lib/server-settings"

test("free tier ignores premium toggles", () => {
  const incoming: any = {
    multiSourceStreaming: true,
    playlistSync: true,
    aiRecommendations: true,
    exportWebhooks: true,
    automationLevel: "full",
    webhookEvents: ["track_start"],
    queueLimit: 5000,
  }

  const sanitized = sanitizeSettingsForTier(incoming, "free")

  assert.equal(sanitized.multiSourceStreaming, defaultServerFeatureSettings.multiSourceStreaming)
  assert.equal(sanitized.playlistSync, defaultServerFeatureSettings.playlistSync)
  assert.equal(sanitized.aiRecommendations, defaultServerFeatureSettings.aiRecommendations)
  assert.equal(sanitized.exportWebhooks, defaultServerFeatureSettings.exportWebhooks)
  assert.equal(sanitized.automationLevel, "off")
  assert.equal(Array.isArray(sanitized.webhookEvents) && sanitized.webhookEvents.length, 0)
  assert.equal(sanitized.queueLimit, 100)
})
