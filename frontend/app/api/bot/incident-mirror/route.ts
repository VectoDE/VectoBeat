import { NextRequest, NextResponse } from "next/server"
import { getLatestIncidentMirror } from "@/lib/db"
import { defaultServerFeatureSettings } from "@/lib/server-settings"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const guildId = searchParams.get("guildId")?.trim()
  const label = (searchParams.get("label") || searchParams.get("targetLabel") || "staging").trim().toLowerCase()

  if (!guildId) {
    return NextResponse.json({ error: "guildId_required" }, { status: 400 })
  }

  try {
    const mirror = await getLatestIncidentMirror(guildId, label)
    if (mirror) {
      return NextResponse.json({ mirror })
    }
    // Graceful fallback so callers don't error when no mirror exists yet.
    return NextResponse.json({
      mirror: {
        id: "placeholder",
        sourceGuildId: guildId,
        targetLabel: label,
        tier: "free",
        createdBy: null,
        createdAt: new Date().toISOString(),
        settings: defaultServerFeatureSettings,
      },
      note: "no_mirror_found",
    })
  } catch (error) {
    console.error("[VectoBeat] Failed to fetch incident mirror:", error)
    return NextResponse.json({ error: "unavailable" }, { status: 500 })
  }
}
