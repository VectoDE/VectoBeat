import { getApiKeySecrets } from "./api-keys"
import { apiClient } from "./api-client"

const STATUS_API_URL =
  process.env.BOT_STATUS_API_URL || process.env.STATUS_API_URL || process.env.STATUS_API_EVENT_URL || ""
const AUTH_TOKEN_TYPES = ["status_api", "status_events", "control_panel", "server_settings"]

const buildAuthHeaders = (tokens: string[]): HeadersInit | undefined => {
  if (!tokens.length) return undefined
  const primary = tokens[0]
  return {
    Authorization: `Bearer ${primary}`,
    "x-api-key": primary,
    "x-bot-status-api-key": primary,
    "x-status-api-key": primary,
    "x-control-panel-key": primary,
    "x-server-settings-key": primary,
  }
}

export const emitBotControl = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
  if (!STATUS_API_URL) {
    console.warn("[VectoBeat] STATUS_API_URL is not configured; bot control skipped.")
    return false
  }
  const base = STATUS_API_URL.replace(/\/status$/, "")
  const target = `${base}${path.startsWith("/") ? path : `/${path}`}`
  const tokens = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  const primary = tokens[0] ?? ""
  try {
    await apiClient<any>(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(primary ? { Authorization: `Bearer ${primary}` } : {}),
        ...buildAuthHeaders(tokens),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch (error) {
    console.error("[VectoBeat] Bot control emit failed:", error)
    return false
  }
}
