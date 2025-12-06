import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions, listSupportKnowledgeBase, getUserRole } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId required" }, { status: 400 })
  }
  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const subs = await getUserSubscriptions(discordId)
  const tiers = subs.map((sub) => normalizeTierId(sub.tier))
  if (!hasProPlus(tiers)) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 })
  }

  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const articles = await listSupportKnowledgeBase(8)
  return NextResponse.json({ articles, tier: tiers[0] ?? "free" })
}
