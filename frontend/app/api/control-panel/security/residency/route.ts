import { NextResponse, type NextRequest } from "next/server"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { DATA_RESIDENCY_PROOFS } from "@/lib/data-residency"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureSecurityAccess = (tier: MembershipTier) => getPlanCapabilities(tier).serverSettings.exportWebhooks

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

  const proofs = DATA_RESIDENCY_PROOFS.map((proof) => ({
    ...proof,
    downloadPath: `/api/control-panel/security/residency/${proof.id}/attestation`,
  }))
  return NextResponse.json({ proofs })
}
