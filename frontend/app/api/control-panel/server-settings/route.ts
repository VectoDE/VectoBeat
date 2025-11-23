import { NextResponse, type NextRequest } from "next/server"
import { getServerSettings, updateServerSettings, getGuildSubscriptionTier } from "@/lib/db"
import { sanitizeSettingsForTier } from "@/app/api/bot/server-settings/route"
import type { ServerFeatureSettings } from "@/lib/server-settings"
import type { MembershipTier } from "@/lib/memberships"
import { notifySettingsChange, triggerRoutingRebalance } from "@/lib/bot-status"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"
import { emitServerSettingsUpdate } from "@/lib/server-settings-sync"

const AUTH_TOKENS = [
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
].filter((value): value is string => Boolean(value && value.trim()))

const isLocalRequest = (request: NextRequest) => {
  const host = (request.headers.get("host") || "").toLowerCase()
  if (host.includes("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") || host.startsWith("::1")) {
    return true
  }
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const forwardedIp = forwarded.split(",")[0]?.trim()
  return forwardedIp === "127.0.0.1" || forwardedIp === "::1"
}

const resolveToken = (request: NextRequest) => {
  const bearer = request.headers.get("authorization") || ""
  if (bearer) {
    const token = bearer.replace(/^Bearer\s+/i, "").trim()
    if (token) return token
  }
  const headerToken =
    request.headers.get("x-api-key") ||
    request.headers.get("x-server-settings-key") ||
    request.headers.get("x-status-key") ||
    request.headers.get("x-analytics-key")
  if (headerToken && headerToken.trim()) {
    return headerToken.trim()
  }
  const queryToken = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("key")
  return queryToken?.trim() || null
}

const isAuthorizedByToken = (request: NextRequest) => {
  if (!AUTH_TOKENS.length) return false
  if (isLocalRequest(request)) return true
  const token = resolveToken(request)
  if (!token) return false
  return AUTH_TOKENS.includes(token)
}

const sanitizeForGuild = async (
  guildId: string,
  updates?: Partial<ServerFeatureSettings>,
  tierOverride?: MembershipTier,
): Promise<{ tier: MembershipTier; settings: ServerFeatureSettings }> => {
  const [tier, current] = await Promise.all([
    tierOverride ? Promise.resolve(tierOverride) : getGuildSubscriptionTier(guildId),
    getServerSettings(guildId),
  ])
  const merged: ServerFeatureSettings = { ...current, ...(updates || {}) }
  const settings = sanitizeSettingsForTier(merged, tier)
  return { tier, settings }
}

type RouteDeps = {
  verifyAccess?: typeof verifyControlPanelGuildAccess
}

export const createServerSettingsHandlers = (deps: RouteDeps = {}) => {
  const verifyAccess = deps.verifyAccess ?? verifyControlPanelGuildAccess

  const getHandler = async (request: NextRequest) => {
    try {
      const guildId = request.nextUrl.searchParams.get("guildId")
      const discordId = request.nextUrl.searchParams.get("discordId")

      const tokenAuthorized = isAuthorizedByToken(request)
      if (!guildId || (!discordId && !tokenAuthorized)) {
        return NextResponse.json({ error: "guildId and discordId are required" }, { status: 400 })
      }

      if (!tokenAuthorized) {
        const access = await verifyAccess(request, discordId!, guildId!)
        if (!access.ok) {
          return NextResponse.json({ error: access.code || "forbidden" }, { status: access.status || 403 })
        }
        const { settings, tier } = await sanitizeForGuild(guildId!, undefined, access.tier)
        return NextResponse.json({ settings, tier })
      }

      const { settings, tier } = await sanitizeForGuild(guildId!)
      return NextResponse.json({ settings, tier })
    } catch (error) {
      console.error("[VectoBeat] Failed to load server settings via API:", error)
      return NextResponse.json({ error: "Unable to load server settings" }, { status: 500 })
    }
  }

  const putHandler = async (request: NextRequest) => {
    try {
      const body = await request.json()
      const { discordId, guildId, settings } = body ?? {}

      const tokenAuthorized = isAuthorizedByToken(request)
      if (!guildId || !settings) {
        return NextResponse.json({ error: "guildId and settings are required" }, { status: 400 })
      }
      if (!tokenAuthorized && !discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }

      let tierOverride: MembershipTier | undefined
      if (!tokenAuthorized) {
        const access = await verifyAccess(request, discordId, guildId)
        if (!access.ok) {
          return NextResponse.json({ error: access.code }, { status: access.status })
        }
        tierOverride = access.tier
      }
      const actorId = discordId || (tokenAuthorized ? "panel-system" : "")
      if (!actorId) {
        return NextResponse.json({ error: "discordId required" }, { status: 400 })
      }
      const includesRegionUpdate =
        settings && typeof settings === "object" && Object.prototype.hasOwnProperty.call(settings, "lavalinkRegion")
      const { settings: sanitized, tier } = await sanitizeForGuild(guildId, settings, tierOverride)
      const merged = await updateServerSettings(guildId, actorId, sanitized)
      emitServerSettingsUpdate(guildId, merged, tier).catch((error) =>
        console.error("[VectoBeat] Failed to emit server settings update:", error),
      )
      notifySettingsChange(guildId).catch((error) =>
        console.error("[VectoBeat] Failed to push settings change to bot:", error),
      )
      if (includesRegionUpdate) {
        try {
          await triggerRoutingRebalance(guildId)
        } catch (error) {
          console.error("[VectoBeat] Failed to notify routing service:", error)
        }
      }
      return NextResponse.json({ settings: merged, tier })
    } catch (error) {
      console.error("[VectoBeat] Failed to update server settings via API:", error)
      return NextResponse.json({ error: "Unable to update server settings" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createServerSettingsHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
