import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, getServerSettings, getGuildSubscriptionTier, createIncidentMirror } from "@/lib/db"

const ensureAdmin = async (request: NextRequest, discordId: string) => {
  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return { ok: false, status: 401 as const, error: "unauthorized" }
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return { ok: false, status: 403 as const, error: "forbidden" }
  }
  return { ok: true as const }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null
  const sourceGuildId = typeof body?.sourceGuildId === "string" ? body.sourceGuildId.trim() : ""
  const targetLabel =
    typeof body?.targetLabel === "string" && body.targetLabel.trim() ? body.targetLabel.trim().toLowerCase() : "staging"

  if (!discordId || !sourceGuildId) {
    return NextResponse.json({ error: "discordId and sourceGuildId are required" }, { status: 400 })
  }

  const guard = await ensureAdmin(request, discordId)
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  try {
    const [settings, tier] = await Promise.all([getServerSettings(sourceGuildId), getGuildSubscriptionTier(sourceGuildId)])
    const snapshot = await createIncidentMirror({
      sourceGuildId,
      targetLabel,
      settings,
      tier,
      createdBy: discordId,
    })
    if (!snapshot) {
      return NextResponse.json({ error: "unable_to_snapshot" }, { status: 500 })
    }
    return NextResponse.json({ snapshot })
  } catch (error) {
    console.error("[VectoBeat] Failed to create incident mirror:", error)
    return NextResponse.json({ error: "unable_to_snapshot" }, { status: 500 })
  }
}
