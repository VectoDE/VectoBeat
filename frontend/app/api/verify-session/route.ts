import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions, getUserRole } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const resolveDiscordId = async (request: NextRequest) => {
  const cookieStore = await cookies()
  const cookieId =
    cookieStore.get("discord_user_id")?.value ||
    cookieStore.get("discord_id")?.value ||
    cookieStore.get("discordId")?.value
  const queryId = request.nextUrl.searchParams.get("discordId")
  return cookieId || queryId
}

export async function GET(request: NextRequest) {
  const discordId = await resolveDiscordId(request)
  if (!discordId) {
    return NextResponse.json({ authenticated: false })
  }

  const verification = await verifyRequestForUser(request, discordId)
  if (!verification.valid) {
    return NextResponse.json({ authenticated: false })
  }

  const guilds = await resolveGuilds(verification)
  const subscriptions = await getUserSubscriptions(discordId)
  const tiers = subscriptions.map((sub) => normalizeTierId(sub.tier))
  const role = await getUserRole(discordId)
  const user = verification.user || null
  const username = (user as any)?.username || (user as any)?.displayName || discordId
  const displayName = (user as any)?.displayName || (user as any)?.username || username
  const email = (user as any)?.email || (user as any)?.contact?.email || null
  const avatarUrl = (user as any)?.avatarUrl || null
  const createdAt = (user as any)?.createdAt || (user as any)?.lastSeen || null
  return NextResponse.json({
    authenticated: true,
    id: discordId,
    discordId,
    username,
    displayName,
    email,
    avatarUrl,
    createdAt,
    role,
    guilds,
    user,
    subscriptions,
    tiers,
  })
}

// --------------------------------------------------------------------------- helpers
const mapDiscordGuilds = (raw: any[]): Array<{ id: string; name: string; hasBot: boolean; isAdmin: boolean }> => {
  return raw
    .map((g) => {
      if (!g || typeof g.id !== "string" || typeof g.name !== "string") return null
      const perms = typeof g.permissions === "string" ? Number(g.permissions) : 0
      const isAdmin = Boolean(g.owner) || (Number.isFinite(perms) && (perms & 0x20 || perms & 0x8))
      return {
        id: g.id,
        name: g.name,
        hasBot: true, // assume bot present; corrected by status/plan data later
        isAdmin,
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string; hasBot: boolean; isAdmin: boolean }>
}

const resolveGuilds = async (verification: any) => {
  const existing = Array.isArray(verification.user?.guilds) ? verification.user.guilds : null
  if (existing && existing.length) {
    return existing
  }
  const token = verification.token
  if (!token) return []
  try {
    const resp = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!resp.ok) return existing || []
    const data = await resp.json()
    if (!Array.isArray(data)) return existing || []
    return mapDiscordGuilds(data)
  } catch {
    return existing || []
  }
}
