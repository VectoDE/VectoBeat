import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getGuildSubscriptionTier, getScaleAccountContact } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"

const sanitize = (value?: string | null, max = 120) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

export async function GET(request: NextRequest) {
  const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
  const discordId = sanitize(request.nextUrl.searchParams.get("discordId"), 32)

  if (!guildId || !discordId) {
    return NextResponse.json({ error: "guildId_and_discordId_required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const tier = (await getGuildSubscriptionTier(guildId)) as MembershipTier
  const plan = getPlanCapabilities(tier)
  if (!plan.features.successPod) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const contact = await getScaleAccountContact(guildId)
  return NextResponse.json({ contact })
}
