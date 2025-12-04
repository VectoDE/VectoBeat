import { type NextRequest, NextResponse } from "next/server"
import { emitBotControl } from "@/lib/bot-control"
import { authBypassEnabled } from "@/lib/auth"

const AUTH_TOKEN =
  process.env.SERVER_SETTINGS_API_KEY || process.env.STATUS_API_PUSH_SECRET || process.env.STATUS_API_KEY || ""

const isAuthorized = (request: NextRequest) => {
  if (authBypassEnabled()) return true
  if (!AUTH_TOKEN) return true
  const header = request.headers.get("authorization")
  return header === `Bearer ${AUTH_TOKEN}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const discordId = typeof payload?.discordId === "string" ? payload.discordId : null
  const settings = payload?.settings
  if (!discordId || !settings || typeof settings !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const ok = await emitBotControl("/reconcile-defaults", { discordId, settings })
  return NextResponse.json({ ok })
}
