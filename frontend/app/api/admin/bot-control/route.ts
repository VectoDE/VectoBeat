import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import { sendBotControlAction } from "@/lib/bot-status"

const ACTIONS: Record<string, string> = {
  start: "start",
  restart: "restart",
  stop: "stop",
  reload: "reload",
  reload_commands: "reload-commands",
  reload_config: "reload-config",
  restart_frontend: "restart-frontend",
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const discordId = typeof body?.discordId === "string" ? body.discordId : null
    const action = typeof body?.action === "string" ? body.action : null
    if (!discordId || !action) {
      return NextResponse.json({ error: "discordId and action are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (!["admin", "operator"].includes(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const mapped = ACTIONS[action] || action
    const ok = await sendBotControlAction(mapped)
    if (!ok) {
      return NextResponse.json({ error: "control_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[VectoBeat] Bot control failed:", error)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
