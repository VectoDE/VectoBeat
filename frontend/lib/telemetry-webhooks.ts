import { createHmac } from "node:crypto"

import { getServerSettings } from "@/lib/db"
import { apiClient } from "./api-client"

type TelemetryEnvelope = {
  ts: number
  event: string
  guildId: string
  shardId?: number | null
  source?: string
  data: Record<string, any>
}

const EVENT_MAP: Record<string, string> = {
  play: "track_start",
  track_start: "track_start",
  skip: "dj_override",
  dj_override: "dj_override",
  queue_finished: "queue_idle",
  queue_idle: "queue_idle",
  incident_alert: "incident_created",
  incident_created: "incident_created",
  billing_updated: "billing_usage",
  billing_usage: "billing_usage",
}

const normalizeEvent = (event: string) => {
  const key = event?.toLowerCase().trim()
  return EVENT_MAP[key] || key || "unknown"
}

const buildSignature = (secret: string, body: string) => {
  return createHmac("sha256", secret).update(body).digest("hex")
}

export const deliverTelemetryWebhook = async (params: {
  guildId: string
  event: string
  payload: Record<string, any>
  shardId?: number | null
  source?: string
}): Promise<{ delivered: boolean; status?: number; reason?: string }> => {
  const guildId = typeof params.guildId === "string" ? params.guildId : ""
  if (!guildId) return { delivered: false, reason: "invalid_guild" }

  const event = normalizeEvent(params.event)
  const settings = await getServerSettings(guildId)
  if (!settings.exportWebhooks) {
    return { delivered: false, reason: "webhooks_disabled" }
  }
  const endpoint = (settings.webhookEndpoint || "").trim()
  if (!endpoint) {
    return { delivered: false, reason: "missing_endpoint" }
  }

  const allowed = Array.isArray(settings.webhookEvents) ? settings.webhookEvents : []
  if (allowed.length && !allowed.includes(event)) {
    return { delivered: false, reason: "event_not_allowed" }
  }

  const envelope: TelemetryEnvelope = {
    ts: Date.now(),
    event,
    guildId,
    shardId: params.shardId ?? null,
    source: params.source || "bot",
    data: params.payload || {},
  }

  const body = JSON.stringify(envelope)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const secret = (settings.webhookSecret || "").trim()
  if (secret) {
    headers["x-vectobeat-signature"] = buildSignature(secret, body)
  }

  try {
    await apiClient<any>(endpoint, {
      method: "POST",
      headers,
      body,
    })
    return { delivered: true, status: 200, reason: "OK" }
  } catch (error) {
    console.error("[VectoBeat] Telemetry webhook delivery failed:", error)
    return { delivered: false, reason: "network_error" }
  }
}
