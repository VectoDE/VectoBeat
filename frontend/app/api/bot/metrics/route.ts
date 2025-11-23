import { type NextRequest, NextResponse } from "next/server"
import { getBotMetricHistory, recordBotMetricSnapshot } from "@/lib/db"

const AUTH_TOKENS = [
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.CONTROL_PANEL_API_KEY,
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
    request.headers.get("x-metrics-key") ||
    request.headers.get("x-status-key") ||
    request.headers.get("x-analytics-key")
  if (headerToken && headerToken.trim()) {
    return headerToken.trim()
  }
  const queryToken = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("key")
  return queryToken?.trim() || null
}

const isAuthorized = (request: NextRequest) => {
  if (!AUTH_TOKENS.length) return true
  if (isLocalRequest(request)) return true
  const token = resolveToken(request)
  if (!token) return false
  return AUTH_TOKENS.includes(token)
}

const parseNumber = (value: unknown, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const snapshot = {
    guildCount: parseNumber(payload.guildCount),
    activeListeners: parseNumber(payload.activePlayers ?? payload.listeners),
    totalStreams: parseNumber(payload.totalStreams ?? payload.streams ?? payload.streamCount),
    uptimePercent: parseNumber(payload.uptimePercent ?? payload.uptime ?? payload.uptimeSeconds),
    avgResponseMs: parseNumber(payload.latency ?? payload.latencyMs ?? payload.averageLatency),
    voiceConnections: parseNumber(payload.voiceConnections ?? payload.activeVoice ?? payload.connectedVoiceChannels),
    incidents24h: parseNumber(payload.incidents24h ?? payload.incidents),
    commands24h: parseNumber(payload.commands24h ?? payload.commandCount24h ?? payload.commands),
    shardsOnline: parseNumber(payload.shardsOnline),
    shardsTotal: parseNumber(payload.shardsTotal ?? payload.shardCount),
  }

  await recordBotMetricSnapshot(snapshot)

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const history = await getBotMetricHistory(1)
  const latest = history.at(-1) ?? null
  return NextResponse.json({
    snapshot: latest,
    history,
  })
}
