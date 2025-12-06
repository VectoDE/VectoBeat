import { type NextRequest, NextResponse } from "next/server"
import { recordAutomationAction } from "@/lib/db"
import { getApiKeySecrets } from "@/lib/api-keys"

const SECRET_TYPES = ["automation_log_secret", "status_events", "server_settings", "status_api"]

export async function POST(request: NextRequest) {
  const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: false })
  const header = request.headers.get("authorization")
  const token = header?.replace(/^Bearer\s+/i, "")
  if (!token || !secrets.includes(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const guildId = typeof payload?.guildId === "string" ? payload.guildId.trim() : ""
  const action = typeof payload?.action === "string" ? payload.action.trim() : ""
  if (!guildId || !action) {
    return NextResponse.json({ error: "guildId_and_action_required" }, { status: 400 })
  }

  await recordAutomationAction({
    guildId,
    action,
    category: typeof payload?.category === "string" ? payload.category : null,
    description: typeof payload?.description === "string" ? payload.description : null,
    shardId: Number.isFinite(Number(payload?.shardId)) ? Number(payload.shardId) : null,
    tier: typeof payload?.tier === "string" ? payload.tier : null,
    metadata: typeof payload?.metadata === "object" && payload.metadata ? payload.metadata : null,
    createdAt:
      typeof payload?.createdAt === "string" || payload?.createdAt instanceof Date
        ? new Date(payload.createdAt)
        : undefined,
  })

  return NextResponse.json({ ok: true })
}
