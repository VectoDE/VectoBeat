import type { MembershipTier } from "./memberships"
import type { ServerFeatureSettings } from "./server-settings"

const getInternalBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

const BROADCAST_TOKEN = process.env.SERVER_SETTINGS_API_KEY || process.env.STATUS_API_PUSH_SECRET || ""

export const emitServerSettingsUpdate = async (
  guildId: string,
  settings: ServerFeatureSettings,
  tier: MembershipTier,
): Promise<boolean> => {
  const endpoint = `${getInternalBaseUrl()}/api/server-settings-broadcast`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BROADCAST_TOKEN ? { Authorization: `Bearer ${BROADCAST_TOKEN}` } : {}),
      },
      body: JSON.stringify({ guildId, settings, tier }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    clearTimeout(timeout)
    console.error("[VectoBeat] Failed to broadcast server settings:", error)
    return false
  }
}
