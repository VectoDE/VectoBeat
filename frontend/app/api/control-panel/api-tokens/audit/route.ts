import { NextResponse, type NextRequest } from "next/server"
import { listApiTokenEvents } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const AUTH_TOKENS = [
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.STATUS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.BOT_STATUS_API_KEY,
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
    const token = bearer.replace(/^Bearer\\s+/i, "").trim()
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

const ensureApiAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")
  const discordId = request.nextUrl.searchParams.get("discordId")
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "15")
  const tokenAuthorized = isAuthorizedByToken(request)
  if (!guildId || (!discordId && !tokenAuthorized)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  if (!tokenAuthorized) {
    const access = await verifyControlPanelGuildAccess(request, discordId!, guildId)
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: access.status })
    }
    if (!ensureApiAccess(access.tier)) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }
  }

  const events = await listApiTokenEvents(guildId, Math.max(5, Math.min(limit, 50)))
  return NextResponse.json({ events })
}
