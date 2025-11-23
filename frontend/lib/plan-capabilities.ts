import type { MembershipTier } from "./memberships"

const parsePlanCapabilities = () => {
  const payload = process.env.NEXT_PUBLIC_PLAN_CAPABILITIES
  if (!payload) {
    throw new Error("NEXT_PUBLIC_PLAN_CAPABILITIES is not defined")
  }
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch (error) {
    console.error("[VectoBeat] Failed to parse NEXT_PUBLIC_PLAN_CAPABILITIES:", error)
    throw error
  }
}

export type PlanServerSettings = {
  multiSourceStreaming: boolean
  maxSourceAccessLevel: "core" | "extended" | "unlimited"
  maxPlaybackQuality: "standard" | "hires"
  playlistSync: boolean
  maxAnalyticsMode: "basic" | "advanced" | "predictive"
  aiRecommendations: boolean
  maxAutomationLevel: "off" | "smart" | "full"
  allowAutomationWindow: boolean
  allowedLavalinkRegions: string[]
  exportWebhooks: boolean
}

export type PlanFeatures = {
  apiTokens: boolean
  webhookExports: boolean
  successPod: boolean
  regionalRouting: boolean
  concierge: boolean
}

export type PlanCapabilities = {
  limits: {
    queue: number | null
    conciergeHours: number | null
  }
  concierge: {
    slaMinutes: number | null
  }
  serverSettings: PlanServerSettings
  features: PlanFeatures
}

const PLAN_CAPABILITIES = parsePlanCapabilities() as Record<MembershipTier, PlanCapabilities>

export const getPlanCapabilities = (tier: MembershipTier): PlanCapabilities => {
  const normalized = tier?.toLowerCase() as MembershipTier
  return PLAN_CAPABILITIES[normalized] ?? PLAN_CAPABILITIES.free
}

export const getQueueLimitCap = (tier: MembershipTier): number | null => {
  const plan = getPlanCapabilities(tier)
  return plan.limits.queue
}
