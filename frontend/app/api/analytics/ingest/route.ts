import { NextRequest, NextResponse } from "next/server"
import { getLatestBotMetricSnapshot, recordBotMetricSnapshot } from "@/lib/db"

const ANALYTICS_TOKENS = [
  process.env.ANALYTICS_API_KEY,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.CONTROL_PANEL_API_KEY,
].filter((value): value is string => Boolean(value && value.trim()))

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 })

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
    request.headers.get("x-api-key") || request.headers.get("x-analytics-key") || request.headers.get("x-status-key")
  if (headerToken && headerToken.trim()) {
    return headerToken.trim()
  }
  const queryToken = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("key")
  return queryToken?.trim() || null
}

const isAuthorized = (request: NextRequest) => {
  if (!ANALYTICS_TOKENS.length) {
    return true
  }
  if (isLocalRequest(request)) {
    return true
  }
  const token = resolveToken(request)
  if (!token) return false
  return ANALYTICS_TOKENS.includes(token)
}

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized()
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  await recordBotMetricSnapshot({
    guildCount: toNumber((body as any).guildCount),
    activeListeners: toNumber((body as any).activeListeners),
    totalStreams: toNumber((body as any).totalStreams),
    uptimePercent: toNumber((body as any).uptimePercent),
    avgResponseMs: toNumber((body as any).avgResponseMs),
    voiceConnections: toNumber((body as any).voiceConnections),
    incidents24h: toNumber((body as any).incidents24h),
    commands24h: toNumber((body as any).commands24h),
    shardsOnline: toNumber((body as any).shardsOnline),
    shardsTotal: toNumber((body as any).shardsTotal),
  })

  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized()
  }

  const snapshot = await getLatestBotMetricSnapshot()
  if (!snapshot) {
    return NextResponse.json({ snapshot: null, error: "no_data" }, { status: 404 })
  }

  return NextResponse.json({
    snapshot: {
      ...snapshot,
      recordedAt: snapshot.recordedAt?.toISOString?.() ?? snapshot.recordedAt,
    },
  })
}
