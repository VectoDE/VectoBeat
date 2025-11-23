import { NextRequest, NextResponse } from "next/server"
import { triggerRoutingRebalance } from "@/lib/bot-status"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
  const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }
  const plan = getPlanCapabilities(access.tier as MembershipTier)
  if (!plan.features.regionalRouting) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }
  const success = await triggerRoutingRebalance(guildId)
  if (!success) {
    return NextResponse.json({ error: "bot_unreachable" }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
