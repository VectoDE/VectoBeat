import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeSettingsForTier } from "../app/api/bot/server-settings/route"
import { defaultServerFeatureSettings } from "../lib/server-settings"
import type { ServerFeatureSettings } from "../lib/server-settings"

const buildSettings = (overrides: Partial<ServerFeatureSettings> = {}): ServerFeatureSettings => ({
  ...defaultServerFeatureSettings,
  ...overrides,
})

test("free tier clamps queue limit and disables premium controls", () => {
  const incoming = buildSettings({
    queueLimit: 5000,
    sourceAccessLevel: "unlimited",
    analyticsMode: "predictive",
    automationLevel: "full",
    playbackQuality: "hires",
    multiSourceStreaming: true,
    aiRecommendations: true,
    collaborativeQueue: false,
  })

  const sanitized = sanitizeSettingsForTier(incoming, "free")

  assert.equal(sanitized.queueLimit, 100, "queue limit capped at free plan default")
  assert.equal(sanitized.sourceAccessLevel, "core")
  assert.equal(sanitized.analyticsMode, "basic")
  assert.equal(sanitized.automationLevel, "off")
  assert.equal(sanitized.playbackQuality, "standard")
  assert.equal(sanitized.multiSourceStreaming, false)
  assert.equal(sanitized.aiRecommendations, false)
  assert.equal(sanitized.collaborativeQueue, false, "explicit false flag should persist")
})

test("free tier rejects invalid inputs gracefully", () => {
  const incoming = buildSettings({
    queueLimit: Number.POSITIVE_INFINITY,
    brandingAccentColor: "#zzzzzz",
    customPrefix: "   ",
  })

  const sanitized = sanitizeSettingsForTier(incoming, "free")

  assert.equal(sanitized.queueLimit, 100)
  assert.equal(sanitized.brandingAccentColor, defaultServerFeatureSettings.brandingAccentColor)
  assert.equal(sanitized.customPrefix, defaultServerFeatureSettings.customPrefix)
})

test("starter tier unlocks advanced controls while enforcing tier caps", () => {
  const incoming = buildSettings({
    queueLimit: 5000,
    multiSourceStreaming: true,
    sourceAccessLevel: "extended",
    playlistSync: true,
    analyticsMode: "advanced",
    automationLevel: "smart",
    customPrefix: "vb!",
  })

  const sanitized = sanitizeSettingsForTier(incoming, "starter")

  assert.equal(sanitized.queueLimit, 5000, "starter queue remains unbounded")
  assert.equal(sanitized.multiSourceStreaming, true)
  assert.equal(sanitized.sourceAccessLevel, "extended")
  assert.equal(sanitized.playlistSync, true)
  assert.equal(sanitized.analyticsMode, "advanced")
  assert.equal(sanitized.automationLevel, "off", "starter guilds cannot opt into Neuro automation")
  assert.equal(sanitized.customPrefix, "vb!")
})

test("pro tier keeps premium toggles without clamping values", () => {
  const incoming = buildSettings({
    queueLimit: 25000,
    sourceAccessLevel: "unlimited",
    playbackQuality: "hires",
    aiRecommendations: true,
    multiSourceStreaming: true,
    automationLevel: "smart",
  })

  const sanitized = sanitizeSettingsForTier(incoming, "pro")

  assert.equal(sanitized.queueLimit, 25000)
  assert.equal(sanitized.sourceAccessLevel, "unlimited")
  assert.equal(sanitized.playbackQuality, "hires")
  assert.equal(sanitized.aiRecommendations, true)
  assert.equal(sanitized.multiSourceStreaming, true)
  assert.equal(sanitized.automationLevel, "smart", "pro keeps smart automation")
})
