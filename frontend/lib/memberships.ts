type TierFeature = {
  name: string
  value?: string
  included: boolean
}

export const MEMBERSHIP_TIERS = {
  free: {
    name: "Free",
    price: "€0",
    period: "",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "Perfect for individuals and small communities",
    tagline: "Best for getting started",
    value: [
      "Basic music streaming from 5 sources",
      "Queue management (up to 100 tracks)",
      "Community analytics dashboard",
      "Standard Care via Support Desk (responses under 24h)",
    ],
    features: [
      { name: "Streaming sources", value: "5", included: true },
      { name: "Queue management", value: "100 tracks", included: true },
      { name: "Analytics dashboard", included: true },
      { name: "Support response time", value: "Under 24h (Standard Care)", included: true },
      { name: "Custom prefix & branding", included: false },
      { name: "Playlist storage", value: "Redis synced", included: false },
      { name: "API access & integrations", included: false },
      { name: "Dedicated account manager", included: false },
    ] satisfies TierFeature[],
    highlighted: false,
    cta: "Add to Discord",
  },
  starter: {
    name: "Starter",
    price: "€6.99",
    period: "/month",
    monthlyPrice: 6.99,
    yearlyPrice: 69.99,
    description: "For growing communities with advanced needs",
    tagline: "Best for growing communities",
    value: [
      "All Free features",
      "15 streaming sources",
      "Unlimited queue management",
      "Advanced analytics & reports",
      "Standard Care support with responses under 24 hours",
    ],
    features: [
      { name: "Streaming sources", value: "15", included: true },
      { name: "Queue management", value: "Unlimited", included: true },
      { name: "Advanced analytics & reports", included: true },
      { name: "Support response time", value: "Under 24h (Standard Care)", included: true },
      { name: "Custom prefix & branding", included: true },
      { name: "Playlist storage", value: "50+ Redis lists", included: true },
      { name: "API access & integrations", included: false },
      { name: "Dedicated account manager", included: false },
    ] satisfies TierFeature[],
    highlighted: false,
    cta: "Start Free Trial",
  },
  pro: {
    name: "Pro",
    price: "€14.99",
    period: "/month",
    monthlyPrice: 14.99,
    yearlyPrice: 149.99,
    description: "For established communities with premium features",
    tagline: "Most popular - Best value",
    value: [
      "All Starter features",
      "Unlimited everything",
      "Real-time queue synchronization",
      "AI-powered recommendations",
      "Priority Care 24/7 support with under 4h responses",
    ],
    features: [
      { name: "Streaming sources", value: "Unlimited", included: true },
      { name: "Queue management", value: "Unlimited", included: true },
      { name: "AI-powered recommendations", included: true },
      { name: "Support response time", value: "Under 4h 24/7 (Priority Care)", included: true },
      { name: "Custom prefix & branding", included: true },
      { name: "Playlist storage", value: "Unlimited Redis lists", included: true },
      { name: "API access & integrations", included: true },
      { name: "Dedicated account manager", included: false },
    ] satisfies TierFeature[],
    highlighted: true,
    cta: "Start Free Trial",
  },
  growth: {
    name: "Growth",
    price: "€21.99",
    period: "/month",
    monthlyPrice: 21.99,
    yearlyPrice: 219.99,
    description: "For communities running multiple shards with automation needs",
    tagline: "Best for cross-server orchestration",
    value: [
      "All Pro features",
      "Shard-aware automation",
      "Advanced command throttling",
      "Enhanced analytics exports",
      "Limited concierge access",
    ],
    features: [
      { name: "Streaming sources", value: "Unlimited", included: true },
      { name: "Queue management", value: "Unlimited", included: true },
      { name: "Automation engine", included: true },
      { name: "Support response time", value: "Under 4h 24/7 (Priority Care)", included: true },
      { name: "Custom prefix & branding", included: true },
      { name: "Playlist storage", value: "Global Redis clusters", included: true },
      { name: "API access & webhook triggers", included: true },
      { name: "Concierge hours per month", value: "2", included: true },
    ] satisfies TierFeature[],
    highlighted: false,
    cta: "Upgrade to Growth",
  },
  scale: {
    name: "Scale",
    price: "€29.99",
    period: "/month",
    monthlyPrice: 29.99,
    yearlyPrice: 299.99,
    description: "For fast-growing communities with multiple shards",
    tagline: "Best for scaling operations",
    value: [
      "All Pro features",
      "Dedicated success pod",
      "Regional Lavalink routing",
      "Advanced automation hooks",
      "Limited white-label options",
    ],
    features: [
      { name: "Streaming sources", value: "Unlimited", included: true },
      { name: "Queue management", value: "Unlimited", included: true },
      { name: "AI-powered recommendations", included: true },
      { name: "Support response time", value: "Under 4h 24/7 (Priority Care)", included: true },
      { name: "Custom prefix & white-label branding", included: true },
      { name: "Playlist storage", value: "Global Redis clusters", included: true },
      { name: "API access & custom integrations", included: true },
      { name: "Dedicated account manager", included: true },
    ] satisfies TierFeature[],
    highlighted: false,
    cta: "Upgrade to Scale",
  },
  enterprise: {
    name: "Enterprise",
    price: "€64.99",
    period: "/month",
    monthlyPrice: 64.99,
    yearlyPrice: 649.99,
    description: "For regulated industries and large networks",
    tagline: "Mission-critical reliability",
    value: [
      "All Scale features",
      "Custom SLA & telemetry exports",
      "Dedicated incident bridge",
      "Full white-label experience",
      "Security & compliance desk",
    ],
    features: [
      { name: "Streaming sources", value: "Unlimited", included: true },
      { name: "Queue management", value: "Unlimited", included: true },
      { name: "AI-powered recommendations", included: true },
      { name: "Support response time", value: "Custom 24/7 SLA (Priority Care)", included: true },
      { name: "Custom API & white-label", included: true },
      { name: "Global clusters", value: "EU/US/APAC", included: true },
      { name: "Security compliance pack", included: true },
      { name: "Named TAM & quarterly reviews", included: true },
    ] satisfies TierFeature[],
    highlighted: false,
    cta: "Contact Sales",
  },
}

export type MembershipTier = keyof typeof MEMBERSHIP_TIERS

const MEMBERSHIP_TIER_KEYS = Object.keys(MEMBERSHIP_TIERS) as MembershipTier[]
const MEMBERSHIP_TIER_SET = new Set<MembershipTier>(MEMBERSHIP_TIER_KEYS)

export const isMembershipTier = (value?: string | null): value is MembershipTier => {
  if (typeof value !== "string") {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return MEMBERSHIP_TIER_SET.has(normalized as MembershipTier)
}

export const normalizeTierId = (value?: string | null): MembershipTier => {
  if (!value || typeof value !== "string") {
    return "free"
  }
  const normalized = value.trim().toLowerCase()
  return isMembershipTier(normalized) ? (normalized as MembershipTier) : "free"
}
