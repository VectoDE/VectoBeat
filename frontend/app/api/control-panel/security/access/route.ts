import { NextResponse, type NextRequest } from "next/server"
import { listSecurityAccessLogs } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureSecurityAccess = (tier: MembershipTier) => getPlanCapabilities(tier).serverSettings.exportWebhooks

const parseDate = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")?.trim()
  const discordId = request.nextUrl.searchParams.get("discordId")?.trim()
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "guild_and_discord_required" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  if (!ensureSecurityAccess(access.tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const from = parseDate(params.get("from"))
  const to = parseDate(params.get("to"))
  const actor = params.get("actor")?.trim() || null
  const limitParam = Number(params.get("limit") || "")
  const limit = Number.isFinite(limitParam) ? Math.max(25, Math.min(500, limitParam)) : 100

  const logs = await listSecurityAccessLogs(guildId, {
    from,
    to,
    actor,
    limit,
    includeDiscordId: discordId,
  })

  return NextResponse.json({ logs })
}
