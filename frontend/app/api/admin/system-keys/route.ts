import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"

const maskValue = (value: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const tail = trimmed.slice(-4)
  const hidden = "•".repeat(Math.max(trimmed.length - 4, 4))
  return `${hidden}${tail}`
}

const pickEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return null
}

const KEY_DEFINITIONS = [
  {
    id: "control_panel",
    label: "Control panel API",
    envVars: ["CONTROL_PANEL_API_KEY"],
    description: "Authorizes bot + panel control calls, including routing and lifecycle actions.",
    required: true,
    category: "core",
  },
  {
    id: "queue_sync",
    label: "Queue sync",
    envVars: ["QUEUE_SYNC_API_KEY"],
    description: "Secures queue sync stream between workers, lavalink nodes, and the panel.",
    required: true,
    category: "sync",
  },
  {
    id: "status_api",
    label: "Status API",
    envVars: ["BOT_STATUS_API_KEY", "STATUS_API_KEY"],
    description: "Used to pull live shard health and push control signals.",
    required: true,
    category: "status",
  },
  {
    id: "status_events",
    label: "Status event push",
    envVars: ["STATUS_API_PUSH_SECRET", "STATUS_API_EVENT_SECRET"],
    description: "Authenticates status webhooks + event broadcasts.",
    required: false,
    category: "status",
  },
  {
    id: "server_settings",
    label: "Server settings broadcast",
    envVars: ["SERVER_SETTINGS_API_KEY"],
    description: "Protects server settings fanout from the panel to the bot fleet.",
    required: true,
    category: "core",
  },
  {
    id: "telemetry",
    label: "Telemetry ingest",
    envVars: ["QUEUE_TELEMETRY_API_KEY"],
    description: "Authorizes queue + listener telemetry submissions.",
    required: false,
    category: "metrics",
  },
  {
    id: "analytics",
    label: "Analytics export",
    envVars: ["ANALYTICS_API_KEY"],
    description: "Secures internal analytics exports + dashboards.",
    required: false,
    category: "metrics",
  },
  {
    id: "alerts",
    label: "Alerting hooks",
    envVars: ["ALERTS_API_KEY"],
    description: "Gates paging and incident notifications from automation flows.",
    required: false,
    category: "alerts",
  },
] as const

const ensureAdmin = async (request: NextRequest, discordId: string) => {
  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return { ok: false, status: 401 as const, error: "Unauthorized" }
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return { ok: false, status: 403 as const, error: "Insufficient permissions" }
  }
  return { ok: true as const }
}

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const guard = await ensureAdmin(request, discordId)
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const keys = KEY_DEFINITIONS.map((definition) => {
    const value = pickEnv(definition.envVars)
    return {
      id: definition.id,
      label: definition.label,
      envVar: definition.envVars[0],
      envVars: definition.envVars,
      description: definition.description,
      category: definition.category,
      required: Boolean(definition.required),
      configured: Boolean(value),
      lastFour: value ? value.slice(-4) : null,
      preview: maskValue(value),
    }
  })

  const endpoints = {
    statusApi: process.env.BOT_STATUS_API_URL || null,
    statusFallbacks: (process.env.BOT_STATUS_API_FALLBACK_URLS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    queueSync: process.env.QUEUE_SYNC_ENDPOINT || null,
    serverSettings: process.env.SERVER_SETTINGS_API_URL || null,
    telemetry: process.env.TELEMETRY_API_URL || null,
  }

  return NextResponse.json({
    keys,
    endpoints,
    generatedAt: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null
  const service = typeof body?.service === "string" ? body.service : null

  if (!discordId || !service) {
    return NextResponse.json({ error: "discordId and service are required" }, { status: 400 })
  }

  const guard = await ensureAdmin(request, discordId)
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const definition = KEY_DEFINITIONS.find((entry) => entry.id === service)
  if (!definition) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 })
  }

  const token = `vb_${randomBytes(24).toString("hex")}`
  return NextResponse.json({
    key: token,
    envVar: definition.envVars[0],
    service: definition.id,
    message: "Update your environment variable and restart workers to apply the new key.",
  })
}
