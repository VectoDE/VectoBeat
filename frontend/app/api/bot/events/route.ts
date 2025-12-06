import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { recordBotActivityEvent } from "@/lib/db"
import { getApiKeySecrets } from "@/lib/api-keys"

const SECRET_TYPES = ["status_events", "status_api"]

export async function POST(request: NextRequest) {
  const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: false })
  if (
    !authorizeRequest(request, secrets, {
      allowLocalhost: true,
    })
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const eventType = typeof payload?.type === "string" ? payload.type.trim() : ""
  if (!eventType) {
    return NextResponse.json({ error: "type_required" }, { status: 400 })
  }

  await recordBotActivityEvent({
    type: eventType,
    name: typeof payload?.name === "string" ? payload.name : null,
    guildId: typeof payload?.guildId === "string" ? payload.guildId : null,
    success:
      typeof payload?.success === "boolean"
        ? payload.success
        : typeof payload?.success === "number"
          ? Boolean(payload.success)
          : null,
    metadata: typeof payload?.metadata === "object" && payload.metadata ? payload.metadata : null,
    createdAt: payload?.ts ? new Date(Number(payload.ts) * 1000) : undefined,
  })

  return NextResponse.json({ ok: true })
}
