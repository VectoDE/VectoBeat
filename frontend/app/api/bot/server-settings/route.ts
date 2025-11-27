import { type NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { authorizeRequest, expandSecrets, extractToken } from "@/lib/api-auth"
import { getGuildSubscriptionTier, getServerSettings, updateServerSettings } from "@/lib/db"
import {
  SERVER_FEATURE_GROUPS,
  TIER_SEQUENCE,
  defaultServerFeatureSettings,
  type ServerFeatureOption,
  type ServerFeatureSettings,
} from "@/lib/server-settings"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { notifySettingsChange } from "@/lib/bot-status"
import { emitServerSettingsUpdate } from "@/lib/server-settings-sync"

const AUTH_TOKENS = expandSecrets(
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
)
const BOT_ACTOR_ID =
  process.env.SERVER_SETTINGS_BOT_ACTOR_ID ||
  process.env.DISCORD_CLIENT_ID ||
  "vectobeat-bot"

const isAuthorized = (request: NextRequest) =>
  authorizeRequest(request, AUTH_TOKENS, {
    allowLocalhost: true,
    headerKeys: ["authorization", "x-api-key", "x-server-settings-key", "x-status-key", "x-analytics-key"],
  })

const HEX_COLOR = /^#([0-9a-f]{6})$/i
const DOMAIN_STATUS_VALUES = new Set(["unconfigured", "pending_dns", "pending_tls", "verified", "failed"])
const TLS_STATUS_VALUES = new Set(["pending", "active", "failed"])

const sanitizeDomain = (value: unknown): string => {
  if (typeof value !== "string") return ""
  let input = value.trim().toLowerCase()
  if (!input) return ""
  input = input.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  if (!/^[a-z0-9.-]+$/.test(input)) {
    return ""
  }
  return input.slice(0, 150)
}

const sanitizeUrlInput = (value: unknown): string => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(prefixed)
    return url.toString().slice(0, 500)
  } catch {
    return ""
  }
}

const sanitizeEmailInput = (value: unknown): string => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return ""
  }
  return trimmed.slice(0, 120)
}

const sanitizeHexColor = (value: unknown): string => {
  if (typeof value !== "string") return ""
  const normalized = value.trim().toUpperCase()
  return HEX_COLOR.test(normalized) ? normalized : ""
}

const optionMap = new Map<keyof ServerFeatureSettings, ServerFeatureOption>()
SERVER_FEATURE_GROUPS.forEach((group) => {
  group.options.forEach((option) => optionMap.set(option.key, option))
})

const tierIndex = (tier: MembershipTier | undefined | null) => {
  const index = tier ? TIER_SEQUENCE.indexOf(tier) : -1
  return index >= 0 ? index : 0
}

const hasTierAccess = (current: MembershipTier, minimum?: MembershipTier) => {
  if (!minimum) return true
  return tierIndex(current) >= tierIndex(minimum)
}

const clampQueueLimit = (value: number, tier: MembershipTier) => {
  const plan = getPlanCapabilities(tier)
  const cap = plan.limits.queue
  if (!Number.isFinite(value)) {
    if (cap !== null && Number.isFinite(cap)) {
      return Math.min(cap, defaultServerFeatureSettings.queueLimit)
    }
    return defaultServerFeatureSettings.queueLimit
  }
  const safeValue = Math.max(50, Math.floor(value))
  return cap !== null ? Math.min(cap, safeValue) : safeValue
}

const AUTOMATION_WINDOW = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

export const sanitizeSettingsForTier = (
  incoming: ServerFeatureSettings,
  tier: MembershipTier,
): ServerFeatureSettings => {
  const plan = getPlanCapabilities(tier)
  const safe: ServerFeatureSettings = { ...defaultServerFeatureSettings }
  const target = safe as Record<string, any>

  for (const [key, option] of optionMap.entries()) {
    if (!option) continue
    if (!hasTierAccess(tier, option.minTier)) {
      target[key] = defaultServerFeatureSettings[key]
      continue
    }

    const value = incoming[key]
    switch (option.type) {
      case "boolean": {
        target[key] = applyPlanBooleanOverride(key, plan, value)
        break
      }
      case "select": {
        const choices =
          option.choices?.filter((choice) => hasTierAccess(tier, choice.minTier)) ?? []
        const defaultChoice = choices.find(
          (choice) => choice.value === defaultServerFeatureSettings[key],
        )
        const highestChoice = choices[choices.length - 1]
        const isKnownChoice =
          typeof value === "string" &&
          (option.choices?.some((choice) => choice.value === value) ?? false)
        const selected =
          typeof value === "string" && choices.some((choice) => choice.value === value)
            ? value
            : isKnownChoice
              ? highestChoice?.value ?? (defaultServerFeatureSettings[key] as string)
              : (defaultChoice ?? highestChoice)?.value ?? (defaultServerFeatureSettings[key] as string)
        target[key] = selected
        break
      }
      case "range": {
        const raw = typeof value === "number" ? value : Number(value)
        const minValue =
          typeof option.min === "number" ? option.min : Number(defaultServerFeatureSettings[key])
        const maxValue =
          typeof option.max === "number" ? option.max : Number(defaultServerFeatureSettings[key])
        let next = Number.isFinite(raw) ? raw : defaultServerFeatureSettings[key]
        next = Math.max(minValue, Math.min(maxValue, Number(next)))
        if (option.key === "queueLimit") {
          next = clampQueueLimit(next, tier)
        }
        target[key] = next
        break
      }
      case "multiselect": {
        const allowed = new Set(option.options ?? [])
        const values = Array.isArray(value)
          ? value
              .map((entry) => (typeof entry === "string" ? entry : null))
              .filter((entry): entry is string => Boolean(entry && allowed.has(entry)))
          : []
        target[key] = values
        break
      }
      case "text": {
        const maxLength = option.maxLength ?? 32
        const fallback = (defaultServerFeatureSettings[key] as string) || option.placeholder || ""
        const normalized =
          typeof value === "string" ? value.trim().slice(0, maxLength) : fallback.slice(0, maxLength)
        target[key] = normalized || fallback
        break
      }
      case "color": {
        const fallback = (defaultServerFeatureSettings[key] as string) || "#FF4D6D"
        const normalized = typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback
        target[key] = normalized
        break
      }
      default:
        target[key] = defaultServerFeatureSettings[key]
    }
  }

  // Additional safeguards that depend on other fields
  safe.queueLimit = clampQueueLimit(Number(safe.queueLimit), tier)
  safe.sourceAccessLevel = clampSourceAccessLevel(
    safe.sourceAccessLevel,
    plan.serverSettings.maxSourceAccessLevel,
  )
  safe.playbackQuality = clampPlaybackQuality(
    safe.playbackQuality,
    plan.serverSettings.maxPlaybackQuality,
  )
  safe.analyticsMode = clampAnalyticsMode(safe.analyticsMode, plan.serverSettings.maxAnalyticsMode)
  safe.automationLevel = clampAutomationLevel(
    safe.automationLevel,
    plan.serverSettings.maxAutomationLevel,
  )
  if (!plan.serverSettings.allowAutomationWindow) {
    safe.automationWindow = ""
  } else {
    const windowValue = typeof safe.automationWindow === "string" ? safe.automationWindow.trim() : ""
    safe.automationWindow = AUTOMATION_WINDOW.test(windowValue) ? windowValue : ""
  }
  if (!plan.serverSettings.allowedLavalinkRegions.includes(safe.lavalinkRegion)) {
    safe.lavalinkRegion = plan.serverSettings.allowedLavalinkRegions[0] ?? "auto"
  }

  const normalizeTokenRecords = () => {
    if (!Array.isArray((incoming as any)?.apiTokens)) {
      return defaultServerFeatureSettings.apiTokens
    }
    const tokens = (incoming as any).apiTokens as any[]
    return tokens
      .filter(
        (token) =>
          token &&
          typeof token.id === "string" &&
          typeof token.label === "string" &&
          typeof token.hash === "string" &&
          typeof token.lastFour === "string" &&
          typeof token.createdAt === "string",
      )
      .map((token) => {
        const status: "disabled" | "active" = token.status === "disabled" ? "disabled" : "active"
        return {
          id: token.id,
          label: token.label,
          hash: token.hash,
          lastFour: token.lastFour,
          createdAt: token.createdAt,
          rotatedAt: typeof token.rotatedAt === "string" ? token.rotatedAt : null,
          lastUsedAt: typeof token.lastUsedAt === "string" ? token.lastUsedAt : null,
          scopes:
            Array.isArray(token.scopes) && token.scopes.length
              ? token.scopes.map((scope: any) => (typeof scope === "string" ? scope : "")).filter(Boolean)
              : ["queue.read"],
          createdBy: typeof token.createdBy === "string" ? token.createdBy : null,
          status,
        }
      })
  }
  safe.apiTokens = normalizeTokenRecords()
  const domain = sanitizeDomain((incoming as any)?.customDomain)
  safe.customDomain = domain
  safe.customDomainStatus =
    domain && DOMAIN_STATUS_VALUES.has((incoming as any)?.customDomainStatus)
      ? ((incoming as any).customDomainStatus as ServerFeatureSettings["customDomainStatus"])
      : domain
        ? "pending_dns"
        : "unconfigured"
  safe.customDomainDnsRecord =
    typeof (incoming as any)?.customDomainDnsRecord === "string"
      ? (incoming as any).customDomainDnsRecord.slice(0, 200)
      : ""
  safe.customDomainVerifiedAt =
    typeof (incoming as any)?.customDomainVerifiedAt === "string" ? (incoming as any).customDomainVerifiedAt : null
  safe.customDomainTlsStatus =
    TLS_STATUS_VALUES.has((incoming as any)?.customDomainTlsStatus) && domain
      ? ((incoming as any).customDomainTlsStatus as ServerFeatureSettings["customDomainTlsStatus"])
      : "pending"
  safe.assetPackUrl = sanitizeUrlInput((incoming as any)?.assetPackUrl)
  safe.mailFromAddress = sanitizeEmailInput((incoming as any)?.mailFromAddress)
  safe.embedAccentColor = sanitizeHexColor((incoming as any)?.embedAccentColor)
  safe.embedLogoUrl = sanitizeUrlInput((incoming as any)?.embedLogoUrl)
  safe.embedCtaLabel =
    typeof (incoming as any)?.embedCtaLabel === "string"
      ? (incoming as any).embedCtaLabel.trim().slice(0, 80)
      : ""
  safe.embedCtaUrl = sanitizeUrlInput((incoming as any)?.embedCtaUrl)
  if (!domain) {
    safe.customDomainVerifiedAt = null
    safe.customDomainTlsStatus = "pending"
  }

  return safe
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `"${key}":${stableStringify(entry)}`)
  return `{${entries.join(",")}}`
}

const hashSettings = (value: ServerFeatureSettings) =>
  createHash("sha256").update(stableStringify(value)).digest("hex")

const buildResponse = (guildId: string, tier: MembershipTier, settings: ServerFeatureSettings) => ({
  guildId,
  tier,
  settings,
  signature: hashSettings(settings),
})

const SOURCE_ORDER: ServerFeatureSettings["sourceAccessLevel"][] = ["core", "extended", "unlimited"]
const PLAYBACK_ORDER: ServerFeatureSettings["playbackQuality"][] = ["standard", "hires"]
const ANALYTICS_ORDER: ServerFeatureSettings["analyticsMode"][] = ["basic", "advanced", "predictive"]
const AUTOMATION_ORDER: ServerFeatureSettings["automationLevel"][] = ["off", "smart", "full"]

const clampByOrder = <T extends string>(value: T, maxAllowed: T, order: readonly T[]): T => {
  const valueIndex = order.indexOf(value)
  const allowedIndex = order.indexOf(maxAllowed)
  if (valueIndex === -1 || allowedIndex === -1) {
    return maxAllowed
  }
  return valueIndex <= allowedIndex ? value : maxAllowed
}

const clampSourceAccessLevel = (
  value: ServerFeatureSettings["sourceAccessLevel"],
  allowed: ServerFeatureSettings["sourceAccessLevel"],
) => clampByOrder(value, allowed, SOURCE_ORDER)

const clampPlaybackQuality = (
  value: ServerFeatureSettings["playbackQuality"],
  allowed: ServerFeatureSettings["playbackQuality"],
) => clampByOrder(value, allowed, PLAYBACK_ORDER)

const clampAnalyticsMode = (
  value: ServerFeatureSettings["analyticsMode"],
  allowed: ServerFeatureSettings["analyticsMode"],
) => clampByOrder(value, allowed, ANALYTICS_ORDER)

const clampAutomationLevel = (
  value: ServerFeatureSettings["automationLevel"],
  allowed: ServerFeatureSettings["automationLevel"],
) => clampByOrder(value, allowed, AUTOMATION_ORDER)

const applyPlanBooleanOverride = (
  key: keyof ServerFeatureSettings,
  plan: ReturnType<typeof getPlanCapabilities>,
  incoming: unknown,
) => {
  const incomingValue = Boolean(incoming)
  switch (key) {
    case "multiSourceStreaming":
      return plan.serverSettings.multiSourceStreaming ? incomingValue : false
    case "playlistSync":
      return plan.serverSettings.playlistSync ? incomingValue : false
    case "aiRecommendations":
      return plan.serverSettings.aiRecommendations ? incomingValue : false
    case "exportWebhooks":
      return plan.serverSettings.exportWebhooks ? incomingValue : false
    default:
      return incomingValue
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const guildId = request.nextUrl.searchParams.get("guildId")
  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 })
  }

  try {
    const [rawSettings, tier] = await Promise.all([
      getServerSettings(guildId),
      getGuildSubscriptionTier(guildId),
    ])
    const settings = sanitizeSettingsForTier(rawSettings, tier)
    return NextResponse.json(buildResponse(guildId, tier, settings))
  } catch (error) {
    console.error("[VectoBeat] Failed to resolve bot server settings:", error)
    return NextResponse.json({ error: "unable_to_resolve_settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 })
  }

  const isUpdateRequest = body && typeof body === "object" && "settings" in body
  if (isUpdateRequest) {
    const partial = body.settings ?? {}
    try {
      const [currentSettings, tier] = await Promise.all([
        getServerSettings(guildId),
        getGuildSubscriptionTier(guildId),
      ])
      const merged = { ...currentSettings, ...(partial as Partial<ServerFeatureSettings>) }
      const sanitized = sanitizeSettingsForTier(merged, tier)
      await updateServerSettings(guildId, BOT_ACTOR_ID, sanitized)
      emitServerSettingsUpdate(guildId, sanitized, tier).catch((error) =>
        console.error("[VectoBeat] Failed to emit settings update for guild:", error),
      )
      notifySettingsChange(guildId).catch((error) =>
        console.error("[VectoBeat] Failed to notify bot of settings change:", error),
      )
      return NextResponse.json(buildResponse(guildId, tier, sanitized))
    } catch (error) {
      console.error("[VectoBeat] Failed to persist server settings via bot bridge:", error)
      return NextResponse.json({ error: "unable_to_update_settings" }, { status: 500 })
    }
  }

  try {
    const [rawSettings, tier] = await Promise.all([
      getServerSettings(guildId),
      getGuildSubscriptionTier(guildId),
    ])
    const settings = sanitizeSettingsForTier(rawSettings, tier)
    const signature = hashSettings(settings)
    const provided = typeof body?.signature === "string" ? body.signature : null
    return NextResponse.json({
      guildId,
      tier,
      signature,
      matches: provided ? provided === signature : false,
    })
  } catch (error) {
    console.error("[VectoBeat] Failed to verify server settings via bot bridge:", error)
    return NextResponse.json({ error: "unable_to_verify_settings" }, { status: 500 })
  }
}
