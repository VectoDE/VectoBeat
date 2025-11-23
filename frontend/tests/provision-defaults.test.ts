import test from "node:test"
import assert from "node:assert/strict"
import { provisionDefaultsForTier } from "@/lib/db"
import { defaultServerFeatureSettings } from "@/lib/server-settings"

test("starter provisioning enables extended sources, playlists sync, and large queue", () => {
  const provisioned = provisionDefaultsForTier(null, "starter")
  assert.equal(provisioned.multiSourceStreaming, true)
  assert.equal(provisioned.sourceAccessLevel, "extended")
  assert.equal(provisioned.playlistSync, true)
  assert.ok(provisioned.queueLimit >= 5000)
})

test("existing settings are upgraded but user overrides persist", () => {
  const existing = {
    ...defaultServerFeatureSettings,
    queueLimit: 200,
    multiSourceStreaming: false,
    playlistSync: false,
  }
  const provisioned = provisionDefaultsForTier(existing, "starter")
  assert.equal(provisioned.multiSourceStreaming, true)
  assert.equal(provisioned.playlistSync, true)
  assert.ok(provisioned.queueLimit >= 5000)
  assert.equal(provisioned.automationLevel, defaultServerFeatureSettings.automationLevel)
})

test("provisioning for pro unlocks hi-res playback and AI recommendations", () => {
  const provisioned = provisionDefaultsForTier(null, "pro")
  assert.equal(provisioned.playbackQuality, "hires")
  assert.equal(provisioned.aiRecommendations, true)
})
