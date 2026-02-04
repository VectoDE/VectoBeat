import type { NextRequest } from "next/server"
import { verifyRequestForUser } from "./auth"
import { ACTIVE_SUBSCRIPTION_STATUSES, getUserSubscriptions, type StoredUserProfile, type SubscriptionSummary } from "./db"
import type { MembershipTier } from "./memberships"

type VerifyDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchSubscriptions?: typeof getUserSubscriptions
}

type GuildAccessSuccess = {
  ok: true
  tier: MembershipTier
  subscription: SubscriptionSummary
  user: StoredUserProfile | null
}

type GuildAccessFailure = {
  ok: false
  status: number
  code: "invalid_identity" | "unauthorized" | "guild_not_accessible"
}

export type GuildAccessResult = GuildAccessSuccess | GuildAccessFailure

export const verifyControlPanelGuildAccess = async (
  request: NextRequest,
  discordId: string,
  guildId: string,
  deps: VerifyDeps = {},
): Promise<GuildAccessResult> => {
  const trimmedDiscordId = typeof discordId === "string" ? discordId.trim() : ""
  const trimmedGuildId = typeof guildId === "string" ? guildId.trim() : ""
  if (!trimmedDiscordId || !trimmedGuildId) {
    return { ok: false, status: 400, code: "invalid_identity" }
  }

  const verifier = deps.verifyUser ?? verifyRequestForUser
  const verification = await verifier(request, trimmedDiscordId)
  if (!verification.valid) {
    return { ok: false, status: 401, code: "unauthorized" }
  }

  const fetchSubscriptions = deps.fetchSubscriptions ?? getUserSubscriptions
  const subscriptions = await fetchSubscriptions(trimmedDiscordId)
  const activeMembership = subscriptions.find(
    (entry: SubscriptionSummary) =>
      entry.discordServerId === trimmedGuildId &&
      ACTIVE_SUBSCRIPTION_STATUSES.includes(entry.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number]),
  )

  if (!activeMembership) {
    const userGuilds = verification.user?.guilds || []
    const guildInfo = userGuilds.find((g) => g.id === trimmedGuildId)

    if (guildInfo && guildInfo.isAdmin) {
      return {
        ok: true,
        tier: "free",
        subscription: {
          id: `free-${trimmedGuildId}`,
          discordId: trimmedDiscordId,
          discordServerId: trimmedGuildId,
          name: guildInfo.name,
          tier: "free",
          status: "active",
          stripeCustomerId: null,
          pricePerMonth: 0,
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        user: verification.user ?? null,
      }
    }

    return { ok: false, status: 403, code: "guild_not_accessible" }
  }

  return {
    ok: true,
    tier: activeMembership.tier as MembershipTier,
    subscription: activeMembership,
    user: verification.user ?? null,
  }
}
