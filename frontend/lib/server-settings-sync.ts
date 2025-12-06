import type { MembershipTier } from "./memberships"
import type { ServerFeatureSettings } from "./server-settings"
import { getApiKeySecret } from "./api-keys"

const getInternalBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

const resolveBroadcastToken = async () => {
  const serverSettingsKey = await getApiKeySecret("server_settings", { includeEnv: false })
  if (serverSettingsKey) return serverSettingsKey
  const statusPushKey = await getApiKeySecret("status_events", { includeEnv: false })
  return statusPushKey ?? ""
}

const postWithAuth = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
  const token = await resolveBroadcastToken()
  const endpoint = `${getInternalBaseUrl()}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    clearTimeout(timeout)
    console.error("[VectoBeat] Broadcast request failed:", error)
    return false
  }
}

export const emitServerSettingsUpdate = async (
  guildId: string,
  settings: ServerFeatureSettings,
  tier: MembershipTier,
): Promise<boolean> => {
  return postWithAuth("/api/server-settings-broadcast", { guildId, settings, tier })
}

export const emitBotDefaultsUpdate = async (discordId: string, settings: Record<string, unknown>): Promise<boolean> =>
  postWithAuth("/api/bot-defaults-broadcast", { discordId, settings })
