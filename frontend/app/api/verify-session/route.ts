import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { extractBearerToken } from "@/lib/auth"
import { verifyRequestForUser } from "@/lib/auth"
import { hashSessionToken } from "@/lib/session"
import { getUserSubscriptions, getUserRole, getUserSecurity, getSessionByHash, type SubscriptionSummary } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"
import { apiClient } from "@/lib/api-client"
import { getBotGuildPresence } from "@/lib/bot-status"

const resolveDiscordId = async (request: NextRequest) => {
  const cookieStore = await cookies()
  const cookieId =
    cookieStore.get("discord_user_id")?.value ||
    cookieStore.get("discord_id")?.value ||
    cookieStore.get("discordId")?.value
  const queryId = request.nextUrl.searchParams.get("discordId")
  if (cookieId || queryId) {
    return cookieId || queryId
  }

  const token = extractBearerToken(request)
  if (token) {
    const sessionHash = hashSessionToken(token)
    return await getSessionByHash(sessionHash)
  }

  return null
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
  const tiers = subscriptions.map((sub: SubscriptionSummary) => normalizeTierId(sub.tier))
  const role = await getUserRole(discordId)
  const security = await getUserSecurity(discordId)
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
    requiresTwoFactor: security.twoFactorEnabled,
  })
}

// --------------------------------------------------------------------------- helpers
const mapDiscordGuilds = (raw: any[], botGuilds: Set<string>): Array<{ id: string; name: string; hasBot: boolean; isAdmin: boolean }> => {
  return raw
    .map((g) => {
      if (!g || typeof g.id !== "string" || typeof g.name !== "string") return null
      const perms = typeof g.permissions === "string" ? Number(g.permissions) : 0
      const isAdmin = Boolean(g.owner) || (Number.isFinite(perms) && (perms & 0x20 || perms & 0x8))
      return {
        id: g.id,
        name: g.name,
        hasBot: botGuilds.has(g.id),
        isAdmin,
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string; hasBot: boolean; isAdmin: boolean }>
}

type ResolvedGuild = { id: string; name: string; hasBot: boolean; isAdmin: boolean }

const resolveGuilds = async (verification: any): Promise<ResolvedGuild[]> => {
  const existing = Array.isArray(verification.user?.guilds)
    ? (verification.user.guilds as ResolvedGuild[])
    : []
  const token = verification.token

  // Get real-time bot presence
  const botGuilds = await getBotGuildPresence()

  if (!token) {
    // If no token, we can still update hasBot on existing guilds based on real-time presence
    return existing.map(g => ({
      ...g,
      hasBot: botGuilds.has(g.id)
    }))
  }

  try {
    const data = await apiClient<any>("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!Array.isArray(data)) return existing
    const fresh = mapDiscordGuilds(data, botGuilds)
    return fresh
  } catch {
    return existing.map(g => ({
      ...g,
      hasBot: botGuilds.has(g.id)
    }))
  }
}
