const STATUS_API_URL =
  process.env.BOT_STATUS_API_URL || process.env.STATUS_API_URL || process.env.STATUS_API_EVENT_URL || ""
const STATUS_API_KEY =
  process.env.STATUS_API_EVENT_SECRET ||
  process.env.STATUS_API_PUSH_SECRET ||
  process.env.STATUS_API_KEY ||
  process.env.BOT_STATUS_API_KEY ||
  ""

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
