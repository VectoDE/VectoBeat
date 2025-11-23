import { NextRequest, NextResponse } from "next/server"
import { getBotStatus } from "@/lib/bot-status"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")?.trim()
  const discordId = request.nextUrl.searchParams.get("discordId")?.trim()
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "guild_required" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  const plan = getPlanCapabilities(access.tier as MembershipTier)
  if (!plan.features.regionalRouting) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const status = await getBotStatus()
  const nodes = Array.isArray(status?.nodes) ? status.nodes : []
  const players = Array.isArray(status?.playersDetail) ? status.playersDetail : []
  const normalizedGuildId = guildId
  const player =
    players.find((entry: any) => entry?.guildId === normalizedGuildId) ??
    players.find((entry: any) => entry?.guildId === Number(normalizedGuildId))

  return NextResponse.json({
    nodes,
    player: player ?? null,
    updatedAt: typeof status?.updatedAt === "string" ? status.updatedAt : null,
  })
}
