import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import { getBotMetricHistory, recordBotMetricSnapshot } from "@/lib/db"

const AUTH_TOKENS = expandSecrets(
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.CONTROL_PANEL_API_KEY,
)

const parseNumber = (value: unknown, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export async function POST(request: NextRequest) {
  if (!authorizeRequest(request, AUTH_TOKENS, { allowLocalhost: true })) {
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

  // Prefer a live status pull so uptimePercent reflects downtime between pushes.
  let liveSnapshot: any = null
  try {
    const res = await fetch(process.env.BOT_STATUS_API_URL || "http://localhost:3051/status", {
      headers:
        process.env.BOT_STATUS_API_KEY || process.env.STATUS_API_KEY
          ? { Authorization: `Bearer ${process.env.BOT_STATUS_API_KEY || process.env.STATUS_API_KEY || ""}` }
          : undefined,
      cache: "no-store",
    })
    if (res.ok) {
      liveSnapshot = await res.json()
    }
  } catch (error) {
    console.error("[VectoBeat] Failed to fetch live bot status for metrics:", error)
  }

  const snapshot = liveSnapshot || latest

  return NextResponse.json({
    snapshot,
    history,
  })
}
