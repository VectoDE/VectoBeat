const STATUS_API_URL =
  process.env.BOT_STATUS_API_URL || process.env.STATUS_API_URL || process.env.STATUS_API_EVENT_URL || ""
const STATUS_API_KEY =
  process.env.STATUS_API_EVENT_SECRET ||
  process.env.STATUS_API_PUSH_SECRET ||
  process.env.STATUS_API_KEY ||
  process.env.BOT_STATUS_API_KEY ||
  ""
const ALL_STATUS_KEYS = [
  process.env.STATUS_API_EVENT_SECRET,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
]
  .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  .map((value) => value.trim())

const buildAuthHeaders = (): HeadersInit | undefined => {
  if (!ALL_STATUS_KEYS.length) return undefined
  const primary = ALL_STATUS_KEYS[0]
  return {
    Authorization: `Bearer ${primary}`,
    "x-api-key": primary,
    "x-bot-status-api-key": primary,
    "x-status-api-key": primary,
    "x-control-panel-key": process.env.CONTROL_PANEL_API_KEY || primary,
    "x-server-settings-key": process.env.SERVER_SETTINGS_API_KEY || primary,
  }
}

export const emitBotControl = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
  if (!STATUS_API_URL) {
    console.warn("[VectoBeat] STATUS_API_URL is not configured; bot control skipped.")
    return false
  }
  const base = STATUS_API_URL.replace(/\/status$/, "")
  const target = `${base}${path.startsWith("/") ? path : `/${path}`}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(STATUS_API_KEY ? { Authorization: `Bearer ${STATUS_API_KEY}` } : {}),
        ...buildAuthHeaders(),
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
