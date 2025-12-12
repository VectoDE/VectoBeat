import { cookies } from "next/headers"

import { getUserRole, getUserSubscriptions } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))

export type ForumViewerContext = {
  discordId: string | null
  proAccess: boolean
  isTeam: boolean
  canPost: boolean
  canComment: boolean
  canModerate: boolean
}

export const getForumViewerContext = async (): Promise<ForumViewerContext> => {
  const cookieStore = await cookies()
  const discordId = cookieStore.get("discord_id")?.value || cookieStore.get("discordId")?.value || null
  let proAccess = false
  let isTeam = false
  let role: string | null = null

  try {
    if (discordId) {
      const subs = await getUserSubscriptions(discordId)
      const tiers = subs.map((sub) => normalizeTierId(sub.tier))
      proAccess = hasProPlus(tiers)
      role = await getUserRole(discordId)
      isTeam = ["admin", "operator"].includes(role)
    }
  } catch {
    proAccess = false
    isTeam = false
    role = null
  }

  const elevatedAccess = Boolean(discordId && (proAccess || isTeam))
  return {
    discordId,
    proAccess,
    isTeam,
    canPost: elevatedAccess,
    canComment: elevatedAccess,
    canModerate: Boolean(isTeam && discordId && role),
  }
}

export const resolveForumParams = async <T>(params: Promise<T> | T): Promise<T> => {
  return params && typeof (params as any).then === "function" ? await params : params
}
