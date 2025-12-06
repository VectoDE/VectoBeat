import { getActiveApiCredentialValue, getApiCredentialsByType } from "./db"
import { normalizeToken } from "./api-auth"

type CacheEntry = { value: string | null; expiresAt: number }

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

const TYPE_ALIASES: Record<string, string> = {
  control_panel: "control_panel",
  CONTROL_PANEL_API_KEY: "control_panel",
  control_panel_api_key: "control_panel",
  server_settings: "server_settings",
  SERVER_SETTINGS_API_KEY: "server_settings",
  server_settings_api_key: "server_settings",
  status: "status_api",
  status_api: "status_api",
  STATUS_API_KEY: "status_api",
  BOT_STATUS_API_KEY: "status_api",
  status_api_key: "status_api",
  status_events: "status_events",
  STATUS_API_EVENT_SECRET: "status_events",
  STATUS_API_PUSH_SECRET: "status_events",
  status_api_event_secret: "status_events",
  status_api_push_secret: "status_events",
  queue_sync: "queue_sync",
  QUEUE_SYNC_API_KEY: "queue_sync",
  queue_sync_api_key: "queue_sync",
  analytics: "analytics",
  ANALYTICS_API_KEY: "analytics",
  analytics_api_key: "analytics",
  telemetry: "telemetry",
  QUEUE_TELEMETRY_API_KEY: "telemetry",
  TELEMETRY_API_KEY: "telemetry",
  telemetry_api_key: "telemetry",
  alerts: "alerts",
  ALERTS_API_KEY: "alerts",
  alerts_api_key: "alerts",
  success_pod_api_secret: "success_pod_api_secret",
  SUCCESS_POD_API_SECRET: "success_pod_api_secret",
  automation_log_secret: "automation_log_secret",
  AUTOMATION_LOG_SECRET: "automation_log_secret",
  concierge_api_secret: "concierge_api_secret",
  CONCIERGE_API_SECRET: "concierge_api_secret",
  scale_contact_api_secret: "scale_contact_api_secret",
  SCALE_CONTACT_API_SECRET: "scale_contact_api_secret",
  entitlement_audit_secret: "entitlement_audit_secret",
  ENTITLEMENT_AUDIT_SECRET: "entitlement_audit_secret",
}

const TYPE_ENV_FALLBACKS: Record<string, string[]> = {
  control_panel: ["CONTROL_PANEL_API_KEY"],
  server_settings: ["SERVER_SETTINGS_API_KEY"],
  status_api: ["STATUS_API_KEY", "BOT_STATUS_API_KEY"],
  status_events: ["STATUS_API_PUSH_SECRET", "STATUS_API_EVENT_SECRET"],
  queue_sync: ["QUEUE_SYNC_API_KEY"],
  analytics: ["ANALYTICS_API_KEY"],
  telemetry: ["QUEUE_TELEMETRY_API_KEY", "TELEMETRY_API_KEY"],
  alerts: ["ALERTS_API_KEY"],
  success_pod_api_secret: ["SUCCESS_POD_API_SECRET"],
  automation_log_secret: ["AUTOMATION_LOG_SECRET"],
  concierge_api_secret: ["CONCIERGE_API_SECRET"],
  scale_contact_api_secret: ["SCALE_CONTACT_API_SECRET", "SUCCESS_POD_API_SECRET"],
  entitlement_audit_secret: ["ENTITLEMENT_AUDIT_SECRET"],
}

const nowMs = () => Date.now()

export const normalizeApiKeyType = (value: string) => {
  const trimmed = value.trim()
  const alias = TYPE_ALIASES[trimmed] || TYPE_ALIASES[trimmed.toUpperCase()] || TYPE_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  return trimmed.toLowerCase()
}

const loadEnvFallbacks = (type: string): string[] => {
  const envKeys = TYPE_ENV_FALLBACKS[type] ?? []
  const fromEnv = envKeys
    .map((key) => process.env[key])
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeToken(value))
    .filter(Boolean)
  if (fromEnv.length) {
    return fromEnv
  }
  // Attempt to derive a sensible default like control_panel -> CONTROL_PANEL_API_KEY
  const derivedKey = `${type.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_API_KEY`
  const derivedEnv = process.env[derivedKey]
  return derivedEnv ? [normalizeToken(derivedEnv)].filter(Boolean) : []
}

export const invalidateApiKeyCache = (types?: string[]) => {
  if (!types || !types.length) {
    cache.clear()
    return
  }
  types.map(normalizeApiKeyType).forEach((type) => cache.delete(type))
}

export const getApiKeySecret = async (type: string, options?: { includeEnv?: boolean }) => {
  const secrets = await getApiKeySecrets([type], options)
  return secrets[0] ?? null
}

export const getApiKeySecrets = async (types: string[], options?: { includeEnv?: boolean }) => {
  const normalized = Array.from(new Set(types.map(normalizeApiKeyType).filter(Boolean)))
  if (!normalized.length) return []

  const now = nowMs()
  const missing: string[] = []
  const resolved: string[] = []

  for (const type of normalized) {
    const cached = cache.get(type)
    if (cached && cached.expiresAt > now) {
      if (cached.value) {
        resolved.push(normalizeToken(cached.value))
      }
      continue
    }
    missing.push(type)
  }

  if (missing.length) {
    const fresh = await getApiCredentialsByType(missing)
    const timestamp = nowMs() + CACHE_TTL_MS
    missing.forEach((type) => {
      const record = fresh.find((entry) => entry.type === type && entry.status === "active")
      cache.set(type, { value: record?.value ?? null, expiresAt: timestamp })
      if (record?.value) {
        resolved.push(normalizeToken(record.value))
      }
    })
  }

  if (options?.includeEnv !== false) {
    normalized.forEach((type) => {
      loadEnvFallbacks(type).forEach((value) => resolved.push(value))
    })
  }

  return Array.from(new Set(resolved.filter(Boolean)))
}

export const getApiKeySecretsStrict = async (types: string[]) => {
  return getApiKeySecrets(types, { includeEnv: false })
}

export const ensureApiKeyCached = async (type: string) => {
  const normalized = normalizeApiKeyType(type)
  const cached = cache.get(normalized)
  if (cached && cached.expiresAt > nowMs()) {
    return cached.value
  }
  const value = await getActiveApiCredentialValue(normalized)
  cache.set(normalized, { value, expiresAt: nowMs() + CACHE_TTL_MS })
  return value
}
