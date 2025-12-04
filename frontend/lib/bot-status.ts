const BOT_API_BASE_URL = process.env.BOT_API_BASE_URL || ""
const BOT_STATUS_API_URL =
  process.env.BOT_STATUS_API_URL ||
  (BOT_API_BASE_URL ? `${BOT_API_BASE_URL.replace(/\/+$/, "")}/status` : "")
// Fallback to STATUS_API_KEY so local/prod configs that only set one variable still authenticate.
const BOT_STATUS_API_KEY = process.env.BOT_STATUS_API_KEY || process.env.STATUS_API_KEY
const BOT_STATUS_FALLBACKS = (process.env.BOT_STATUS_API_FALLBACK_URLS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)

const DEFAULT_FALLBACKS = ["http://127.0.0.1:3051/status", "http://localhost:3051/status"]
const ENDPOINT_COOLDOWN_MS = 30_000
const FETCH_TIMEOUT_MS = 8_000
const ALLOW_LOCAL_FALLBACKS =
  process.env.ALLOW_LOCAL_STATUS_FALLBACKS === "1" || process.env.NODE_ENV !== "production"
const AUTH_TOKENS = [
  BOT_STATUS_API_KEY,
  process.env.STATUS_API_KEY,
  process.env.STATUS_API_EVENT_SECRET,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
]
  .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  .map((value) => value.trim())

let cachedBotGuilds: {
  data: Set<string>
  expires: number
} = {
  data: new Set(),
  expires: 0,
}

let cachedBotStatus: {
  data: any
  expires: number
} = {
  data: null,
  expires: 0,
}

let preferredEndpoint = BOT_STATUS_API_URL || ""
let lastErrorKey = ""
let lastErrorAt = 0
const endpointCooldowns = new Map<string, number>()

const normalizeEndpoint = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    return parsed.toString()
  } catch {
    return ""
  }
}

const buildAuthHeaders = (): HeadersInit | undefined => {
  if (!AUTH_TOKENS.length) return undefined
  const primary = AUTH_TOKENS[0]
  return {
    Authorization: `Bearer ${primary}`,
    "x-api-key": primary,
    "x-bot-status-api-key": primary,
    "x-status-api-key": primary,
    "x-control-panel-key": process.env.CONTROL_PANEL_API_KEY || primary,
    "x-server-settings-key": process.env.SERVER_SETTINGS_API_KEY || primary,
  }
}

const appendTokenQuery = (endpoint: string) => {
  if (!AUTH_TOKENS.length) return endpoint
  try {
    const url = new URL(endpoint)
    const hasTokenParam =
      url.searchParams.has("token") || url.searchParams.has("key") || url.searchParams.has("api_key")
    if (!hasTokenParam) {
      url.searchParams.set("token", AUTH_TOKENS[0])
    }
    return url.toString()
  } catch {
    return endpoint
  }
}

const buildStatusCandidates = () => {
  const nowMs = Date.now()
  const baseCandidates = [BOT_STATUS_API_URL || "", preferredEndpoint, ...BOT_STATUS_FALLBACKS]
  const hasConfiguredEndpoint = baseCandidates.some(Boolean)
  const localFallbacks = ALLOW_LOCAL_FALLBACKS && !hasConfiguredEndpoint ? DEFAULT_FALLBACKS : []

  return [...baseCandidates, ...localFallbacks]
    .map((endpoint) => normalizeEndpoint(endpoint))
    .filter((endpoint, index, array) => endpoint && array.indexOf(endpoint) === index)
    .filter((endpoint) => {
      const nextRetry = endpointCooldowns.get(endpoint)
      return !nextRetry || nextRetry <= nowMs
    })
}

const parseGuildIds = (payload: unknown): string[] => {
  const normalizeEntry = (value: unknown) => {
    if (typeof value === "string") return value
    if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
      return (value as { id: string }).id
    }
    if (value && typeof value === "object" && typeof (value as { guildId?: unknown }).guildId === "string") {
      return (value as { guildId: string }).guildId
    }
    return ""
  }

  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload.map(normalizeEntry).filter(Boolean)
  }

  const maybeObject = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null
  if (!maybeObject) return []

  const candidates: unknown[] =
    (Array.isArray(maybeObject.guildIds) && maybeObject.guildIds) ||
    (Array.isArray((maybeObject as any).guild_ids) && (maybeObject as any).guild_ids) ||
    (Array.isArray(maybeObject.guilds) && maybeObject.guilds) ||
    (Array.isArray((maybeObject as any).servers) && (maybeObject as any).servers) ||
    []

  return candidates.map(normalizeEntry).filter(Boolean)
}

export const getBotStatus = async () => {
  const skipBotStatus =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.SKIP_REMOTE_METRICS === "1" ||
    process.env.SKIP_BOT_STATUS === "1"
  if (skipBotStatus) {
    return null
  }

  const now = Date.now()
  if (cachedBotStatus.data && cachedBotStatus.expires > now) {
    return cachedBotStatus.data
  }

  const candidates = buildStatusCandidates()
  if (candidates.length === 0) {
    cachedBotStatus.expires = now + 10 * 1000
    return cachedBotStatus.data
  }

  let lastError: unknown = null
  for (const endpoint of candidates) {
    const target = appendTokenQuery(endpoint)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(target, {
        headers: buildAuthHeaders(),
        next: {
          revalidate: 30,
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Bot status API responded with ${response.status} (${endpoint})`)
      }

      let payload: any = null
      try {
        payload = await response.json()
      } catch (error) {
        throw new Error(`Bot status returned invalid JSON (${endpoint}): ${(error as Error).message}`)
      }
      preferredEndpoint = endpoint
      cachedBotStatus = {
        data: payload,
        expires: now + 30 * 1000,
      }
      return payload
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof DOMException && error.name === "AbortError") {
        // Drop aborted attempts quietly; we'll fall through to other endpoints.
        lastError = new Error(`Bot status request timed out after ${FETCH_TIMEOUT_MS}ms (${endpoint})`)
      } else {
        lastError = error
      }
      lastError = error
      endpointCooldowns.set(endpoint, Date.now() + ENDPOINT_COOLDOWN_MS)
      continue
    }
  }

  if (lastError) {
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    const dedupeKey = `${message}`
    if (!lastErrorKey || dedupeKey !== lastErrorKey || now - lastErrorAt > 30_000) {
      console.error("[VectoBeat] Bot status API error:", lastError)
      lastErrorKey = dedupeKey
      lastErrorAt = now
    }
  }
  cachedBotStatus.expires = now + 10 * 1000
  return cachedBotStatus.data
}

export const getBotGuildPresence = async (): Promise<Set<string>> => {
  const now = Date.now()
  if (cachedBotGuilds.expires > now) {
    return cachedBotGuilds.data
  }

  const status = await getBotStatus()

  if (status) {
    const guildIds = parseGuildIds(status)
    cachedBotGuilds = {
      data: new Set(guildIds),
      expires: now + 30 * 1000,
    }
    return cachedBotGuilds.data
  }

  return cachedBotGuilds.data
}

const deriveControlEndpoint = (endpoint: string, path = "/reconcile-routing") => {
  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) return ""
  const trimmed = normalized.replace(/\/+$/, "")
  if (trimmed.endsWith("/status")) {
    return `${trimmed.slice(0, -7)}${path}`
  }
  return `${trimmed}${path}`
}

const buildControlCandidates = () => {
  const baseCandidates = [preferredEndpoint, BOT_STATUS_API_URL || "", ...BOT_STATUS_FALLBACKS]
  const hasConfiguredEndpoint = baseCandidates.some(Boolean)
  const localFallbacks = ALLOW_LOCAL_FALLBACKS && !hasConfiguredEndpoint ? DEFAULT_FALLBACKS : []

  return [...baseCandidates, ...localFallbacks]
    .map((endpoint) => normalizeEndpoint(endpoint))
    .filter((endpoint, index, array) => endpoint && array.indexOf(endpoint) === index)
}

const postToBotControl = async (path: string, body: Record<string, any>): Promise<boolean> => {
  const nowMs = Date.now()
  const candidates = buildControlCandidates()
  let lastError: unknown = null
  for (const endpoint of candidates) {
    const target = deriveControlEndpoint(endpoint, path)
    if (!target) {
      continue
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        signal: controller.signal,
        body: JSON.stringify(body),
      })
      clearTimeout(timeout)
      if (!response.ok) {
        throw new Error(`Bot control endpoint responded with ${response.status}`)
      }
      preferredEndpoint = endpoint
      endpointCooldowns.set(endpoint, nowMs + ENDPOINT_COOLDOWN_MS)
      return true
    } catch (error) {
      clearTimeout(timeout)
      lastError = error
      continue
    }
  }
  if (lastError) {
    const errMessage = lastError instanceof Error ? lastError.message : String(lastError)
    console.error("[VectoBeat] Bot control request failed:", errMessage)
  }
  return false
}

export const triggerRoutingRebalance = async (guildId: string): Promise<boolean> =>
  postToBotControl("/reconcile-routing", { guildId })

export const notifySettingsChange = async (guildId: string): Promise<boolean> =>
  postToBotControl("/reconcile-settings", { guildId })

export const sendBotControlAction = async (action: string, payload: Record<string, any> = {}) =>
  postToBotControl(`/control/${action}`, { action, ...payload })
