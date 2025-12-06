import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import { emitBotControl } from "@/lib/bot-control"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null
  const reason = typeof body?.reason === "string" ? body.reason : "admin_initiated"

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

  const ok = await emitBotControl("/control/hot-patch", { reason, actor: discordId })
  if (!ok) {
    return NextResponse.json({ error: "hot_patch_failed" }, { status: 502 })
  }

  return NextResponse.json({ ok: true, reason })
}
