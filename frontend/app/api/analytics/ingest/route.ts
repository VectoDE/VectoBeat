import { NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getLatestBotMetricSnapshot, recordBotMetricSnapshot } from "@/lib/db"
import { getApiKeySecrets } from "@/lib/api-keys"

const ANALYTICS_TOKEN_TYPES = ["analytics", "status_api", "status_events", "control_panel"]

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 })

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export async function POST(request: NextRequest) {
  const secrets = await getApiKeySecrets(ANALYTICS_TOKEN_TYPES, { includeEnv: false })
  if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
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
  const secrets = await getApiKeySecrets(ANALYTICS_TOKEN_TYPES, { includeEnv: false })
  if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
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
