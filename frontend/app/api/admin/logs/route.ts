import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, listBotActivityEvents, recordBotActivityEvent } from "@/lib/db"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  const download = request.nextUrl.searchParams.get("download")
  const limitParam = request.nextUrl.searchParams.get("limit")
  const limit = limitParam ? Math.min(1000, Math.max(1, Number(limitParam))) : 200

  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const events = await listBotActivityEvents(limit)

  if (download) {
    const body = JSON.stringify({ events }, null, 2)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="logs-${Date.now()}.json"`,
      },
    })
  }

  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const tokenHeader = request.headers.get("authorization")
  const bearerToken = tokenHeader?.toLowerCase().startsWith("bearer ")
    ? tokenHeader.slice(7).trim()
    : tokenHeader?.trim() || null
  const ingestToken = process.env.LOG_INGEST_TOKEN

  const discordId = request.nextUrl.searchParams.get("discordId")
  let authorized = false

  if (bearerToken && ingestToken && bearerToken === ingestToken) {
    authorized = true
  } else if (discordId) {
    const auth = await verifyRequestForUser(request, discordId)
    if (auth.valid) {
      const role = await getUserRole(discordId)
      authorized = ["admin", "operator"].includes(role)
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventsInput = Array.isArray(body?.events) ? body.events : [body]
  const events = eventsInput
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const type = typeof item.type === "string" ? item.type : null
      if (!type) return null
      return {
        type,
        name: typeof item.name === "string" ? item.name : null,
        guildId: typeof item.guildId === "string" ? item.guildId : null,
        success:
          typeof item.success === "boolean"
            ? item.success
            : typeof item.success === "string"
              ? item.success.toLowerCase() === "true"
              : null,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      }
    })
    .filter(Boolean) as Array<{
    type: string
    name: string | null
    guildId: string | null
    success: boolean | null
    metadata: Record<string, unknown> | null
    createdAt: Date
  }>

  if (!events.length) {
    return NextResponse.json({ error: "No valid events provided" }, { status: 400 })
  }

  await Promise.all(events.map((event) => recordBotActivityEvent(event)))

  return NextResponse.json({ stored: events.length })
}
