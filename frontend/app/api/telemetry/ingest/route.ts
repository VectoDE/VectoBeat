import { NextResponse, type NextRequest } from "next/server"

import { deliverTelemetryWebhook } from "@/lib/telemetry-webhooks"

const TOKEN =
  process.env.TELEMETRY_INGEST_TOKEN ||
  process.env.SERVER_SETTINGS_API_KEY ||
  process.env.CONTROL_PANEL_API_KEY ||
  ""

const authorize = (request: NextRequest) => {
  if (!TOKEN) return false
  const header = request.headers.get("authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (token && token === TOKEN) return true
  const alt = request.headers.get("x-telemetry-token") || ""
  return alt.trim() === TOKEN
}

const parseBody = async (request: NextRequest) => {
  const json = await request.json().catch(() => null)
  if (json) return json
  const form = await request.formData().catch(() => null)
  if (!form) return null
  const payload: Record<string, any> = {}
  form.forEach((value, key) => {
    payload[key] = value
  })
  return payload
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await parseBody(request)
  const event = typeof body?.event === "string" ? body.event : ""
  const guildId = typeof body?.guildId === "string" ? body.guildId : ""
  const shardId =
    typeof body?.shardId === "number"
      ? body.shardId
      : typeof body?.shardId === "string" && !Number.isNaN(Number(body.shardId))
        ? Number(body.shardId)
        : null
  const source = typeof body?.source === "string" ? body.source : undefined
  const payload = (body?.payload && typeof body.payload === "object" ? body.payload : body?.data) || {}

  if (!event || !guildId) {
    return NextResponse.json({ error: "event_and_guild_required" }, { status: 400 })
  }

  const result = await deliverTelemetryWebhook({
    guildId,
    event,
    payload,
    shardId,
    source: source || "bot",
  })

  return NextResponse.json({ delivered: result.delivered, reason: result.reason, status: result.status })
}
