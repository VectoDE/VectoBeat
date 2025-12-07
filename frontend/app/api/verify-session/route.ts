import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
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

  const subscriptions = await getUserSubscriptions(discordId)
  const tiers = subscriptions.map((sub) => normalizeTierId(sub.tier))
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
    user,
    subscriptions,
    tiers,
  })
}
