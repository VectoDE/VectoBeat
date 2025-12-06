import { getApiKeySecrets } from "./api-keys"

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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(primary ? { Authorization: `Bearer ${primary}` } : {}),
        ...buildAuthHeaders(tokens),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    clearTimeout(timeout)
    console.error("[VectoBeat] Bot control emit failed:", error)
    return false
  }
}
