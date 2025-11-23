import { createHash } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getServerSettings, getGuildSubscriptionTier, recordApiTokenEvent } from "@/lib/db"
import { getQueueSnapshot } from "@/lib/queue-sync-store"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { resolveClientIp, resolveClientLocation } from "@/lib/request-metadata"

const normalizeToken = (header: string | null) => {
  if (!header) return null
  const token = header.replace(/^Bearer\s+/i, "").trim()
  return token || null
}

export const hasPlanAccess = (tier: string) =>
  getPlanCapabilities((tier as MembershipTier) ?? "free").serverSettings.playlistSync

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId")
  const token = normalizeToken(request.headers.get("authorization"))
  if (!guildId || !token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const tier = await getGuildSubscriptionTier(guildId)
  if (!hasPlanAccess(tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const settings = await getServerSettings(guildId)
  const tokens = Array.isArray((settings as any)?.apiTokens) ? ((settings as any).apiTokens as any[]) : []
  const hashed = createHash("sha256").update(token).digest("hex")
  const match = tokens.find((entry) => typeof entry?.hash === "string" && entry.hash === hashed)
  if (!match) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const scopes = Array.isArray(match.scopes) && match.scopes.length ? match.scopes : ["queue.read"]
  if (!scopes.includes("queue.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const ipAddress = resolveClientIp(request)
  const location = resolveClientLocation(request)
  const userAgent = request.headers.get("user-agent") || null

  await recordApiTokenEvent({
    guildId,
    tokenId: match.id,
    action: "used",
    actorId: null,
    actorName: "api",
    metadata: {
      endpoint: "/api/external/queue",
      scopes: ["queue.read"],
      tokenLabel: match.label,
      ipAddress,
      location,
      userAgent,
    },
  })

  const snapshot = await getQueueSnapshot(guildId)
  if (!snapshot) {
    return NextResponse.json({ guildId, queue: [], nowPlaying: null, paused: false, volume: null, updatedAt: null })
  }
  return NextResponse.json(snapshot)
}
