import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const macros = [
  {
    id: "ack_incident",
    label: "Incident acknowledgment",
    body: "Thanks for the report. We’ve logged this as an incident and are routing it to ops. Can you confirm shard ID, guild ID, and the last command that failed?",
  },
  {
    id: "queue_cleanup",
    label: "Queue hygiene",
    body: "We’ve enabled Queue Copilots to clean duplicates and smooth loudness. If you still hear volume spikes, share 2-3 track links so we can adjust the preset.",
  },
  {
    id: "status_check",
    label: "Status check",
    body: "We’re not seeing errors on our side. Please run /voiceinfo and /lavalink to share node latency + queue length. We’ll keep this thread open until we confirm stability.",
  },
]

const badges = [
  { id: "incident_responder", label: "Incident Responder", description: "Handled 3+ incident retros" },
  { id: "playbook_author", label: "Playbook Author", description: "Published a forum playbook for the community" },
  { id: "moderator_lead", label: "Moderator Lead", description: "Active moderator with Pro+ guild access" },
]

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))
const highestTier = (tiers: string[]) => {
  const order = ["free", "starter", "pro", "growth", "scale", "enterprise"]
  let best = "free"
  tiers.forEach((tier) => {
    const idx = order.indexOf(tier)
    if (idx > order.indexOf(best)) best = tier
  })
  return best
}

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

  return NextResponse.json({
    macros,
    badges,
    tier: highestTier(tiers),
    stage: "alpha",
  })
}
