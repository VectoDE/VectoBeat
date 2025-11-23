import { getPlanCapabilities } from "./plan-capabilities"
import { getGuildSubscriptionTier, loadQueueSnapshot, purgeExpiredQueueSnapshots, saveQueueSnapshot } from "./db"
import type { MembershipTier } from "./memberships"
import type { QueueSnapshot } from "@/types/queue-sync"

const TTL_BY_TIER_MINUTES: Record<MembershipTier, number> = {
  free: 5,
  starter: 15,
  pro: 30,
  growth: 60,
  scale: 180,
  enterprise: 360,
}

type QueueStoreDeps = {
  fetchTier?: (guildId: string) => Promise<MembershipTier>
  persist?: (snapshot: QueueSnapshot, tier: MembershipTier, expiresAt: Date | null) => Promise<unknown>
  load?: (guildId: string) => Promise<{ snapshot: QueueSnapshot; expiresAt: Date | null } | null>
  purge?: (now?: Date) => Promise<unknown>
  now?: () => number
}

const resolveTtlMinutes = (tier: MembershipTier) => {
  const plan = getPlanCapabilities(tier)
  if (plan.limits.queue !== null && plan.limits.queue < 100) {
    return 5
  }
  return TTL_BY_TIER_MINUTES[tier] ?? 15
}

export const createQueueStore = (deps: QueueStoreDeps = {}) => {
  const fetchTier = deps.fetchTier ?? getGuildSubscriptionTier
  const persist = deps.persist ?? saveQueueSnapshot
  const load = deps.load ?? loadQueueSnapshot
  const purge = deps.purge ?? purgeExpiredQueueSnapshots
  const now = deps.now ?? Date.now

  const setQueueSnapshot = async (snapshot: QueueSnapshot) => {
    const tier = await fetchTier(snapshot.guildId)
    const ttlMinutes = resolveTtlMinutes(tier)
    const expiresAt = Number.isFinite(ttlMinutes) ? new Date(now() + ttlMinutes * 60_000) : null
    const normalized: QueueSnapshot = {
      ...snapshot,
      updatedAt: snapshot.updatedAt || new Date(now()).toISOString(),
    }
    await purge(new Date(now()))
    const current = await load(normalized.guildId)
    const currentExpired = current?.expiresAt && current.expiresAt.getTime() < now()
    const currentUpdatedAt = current?.snapshot?.updatedAt ? new Date(current.snapshot.updatedAt).getTime() : 0
    const incomingUpdatedAt = normalized.updatedAt ? new Date(normalized.updatedAt).getTime() : now()
    if (current && !currentExpired && currentUpdatedAt > incomingUpdatedAt) {
      return current.snapshot
    }
    await persist(normalized, tier, expiresAt)
    return normalized
  }

  const getQueueSnapshot = async (guildId: string) => {
    const record = await load(guildId)
    if (!record) return null
    const expired = record.expiresAt && record.expiresAt.getTime() < now()
    if (expired) {
      await purge(new Date(now()))
      return null
    }
    return record.snapshot
  }

  return { setQueueSnapshot, getQueueSnapshot }
}

const defaultStore = createQueueStore()
export const setQueueSnapshot = defaultStore.setQueueSnapshot
export const getQueueSnapshot = defaultStore.getQueueSnapshot
