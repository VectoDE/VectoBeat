import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import { getAnalyticsOverview } from "@/lib/metrics"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId query param required" }, { status: 400 })
  }

  const verification = await verifyRequestForUser(request, discordId)
  if (!verification.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const subscriptions = await getUserSubscriptions(discordId)
  const hasIntegrationAccess = subscriptions.some((sub) => {
    const plan = getPlanCapabilities(sub.tier as MembershipTier)
    return plan.serverSettings.exportWebhooks
  })
  if (!hasIntegrationAccess) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 })
  }

  const analytics = await getAnalyticsOverview()
  return NextResponse.json({
    analytics,
    generatedAt: new Date().toISOString(),
  })
}
