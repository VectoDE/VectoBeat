import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, getForumStats, listForumEvents } from "@/lib/db"

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

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId required" }, { status: 400 })
  }

  const guard = await ensureAdmin(request, discordId)
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const hours = Number.parseInt(request.nextUrl.searchParams.get("sinceHours") || "72", 10)
  const stats = await getForumStats()
  const events = await listForumEvents(100, { sinceHours: Number.isFinite(hours) ? hours : 72 })

  return NextResponse.json({ stats, events, generatedAt: new Date().toISOString() })
}
