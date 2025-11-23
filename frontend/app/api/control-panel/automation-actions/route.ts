import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getAutomationActionsForGuild, getUserSubscriptions } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  const guildId = request.nextUrl.searchParams.get("guildId")
  const limitParam = request.nextUrl.searchParams.get("limit")
  if (!discordId || !guildId) {
    return NextResponse.json({ error: "discordId_and_guildId_required" }, { status: 400 })
  }

  const verification = await verifyRequestForUser(request, discordId)
  if (!verification.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const subscriptions = await getUserSubscriptions(discordId)
  const membership = subscriptions.find(
    (sub) => sub.discordServerId === guildId && sub.status === "active",
  )
  if (!membership) {
    return NextResponse.json({ error: "guild_not_found" }, { status: 404 })
  }
  const plan = getPlanCapabilities(membership.tier as MembershipTier)
  if (plan.serverSettings.maxAutomationLevel === "off") {
    return NextResponse.json({ error: "growth_required" }, { status: 403 })
  }

  const limit = limitParam ? Number(limitParam) : 50
  const actions = await getAutomationActionsForGuild(guildId, Number.isFinite(limit) ? limit : 50)
  return NextResponse.json({ actions })
}
