import { NextResponse, type NextRequest } from "next/server"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import { listApiTokenEvents } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const AUTH_TOKENS = expandSecrets(
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.STATUS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.BOT_STATUS_API_KEY,
)

const isAuthorizedByToken = (request: NextRequest) =>
  authorizeRequest(request, AUTH_TOKENS, {
    allowLocalhost: true,
    headerKeys: ["authorization", "x-api-key", "x-server-settings-key", "x-status-key", "x-analytics-key"],
  })

const ensureApiAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")
  const discordId = request.nextUrl.searchParams.get("discordId")
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "15")
  const tokenAuthorized = isAuthorizedByToken(request)
  if (!guildId || (!discordId && !tokenAuthorized)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  if (!tokenAuthorized) {
    const access = await verifyControlPanelGuildAccess(request, discordId!, guildId)
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: access.status })
    }
    if (!ensureApiAccess(access.tier)) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }
  }

  const events = await listApiTokenEvents(guildId, Math.max(5, Math.min(limit, 50)))
  return NextResponse.json({ events })
}
