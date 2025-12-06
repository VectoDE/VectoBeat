import { NextResponse, type NextRequest } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { listApiTokenEvents } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"
import { getApiKeySecrets } from "@/lib/api-keys"

const AUTH_TOKEN_TYPES = ["control_panel", "server_settings", "status_api", "status_events"]

const isAuthorizedByToken = async (request: NextRequest) => {
  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  return authorizeRequest(request, secrets, {
    allowLocalhost: true,
    headerKeys: ["authorization", "x-api-key", "x-server-settings-key", "x-status-key", "x-analytics-key"],
  })
}

const ensureApiAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")
  const discordId = request.nextUrl.searchParams.get("discordId")
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "15")
  const tokenAuthorized = await isAuthorizedByToken(request)
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
