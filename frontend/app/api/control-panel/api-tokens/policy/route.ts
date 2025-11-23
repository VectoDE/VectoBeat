import { NextResponse, type NextRequest } from "next/server"
import { getServerSettings, updateServerSettings } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureApiAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
  const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
  const ttlDaysRaw = Number(body?.ttlDays)
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  if (!ensureApiAccess(access.tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const ttlDays = Number.isFinite(ttlDaysRaw) ? Math.max(0, Math.min(365, Math.floor(ttlDaysRaw))) : 0
  const settings = await getServerSettings(guildId)
  const merged = await updateServerSettings(guildId, discordId, {
    ...settings,
    apiTokenTtlDays: ttlDays,
  })

  return NextResponse.json({ ttlDays: merged.apiTokenTtlDays ?? 0 })
}
