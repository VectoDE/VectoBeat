type TierInterval = "monthly" | "yearly"
type TierId = "starter" | "pro" | "growth" | "scale" | "enterprise"

type PriceResolution =
  | { type: "id"; value: string }
  | { type: "amount"; value: number }

const priceMap: Record<TierId, Record<TierInterval, string | undefined>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  growth: {
    monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    yearly: process.env.STRIPE_PRICE_GROWTH_YEARLY,
  },
  scale: {
    monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_SCALE_YEARLY,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
}

const isStripePriceId = (value: string) => /^price_[a-zA-Z0-9]+$/i.test(value.trim())

export const resolveStripePrice = (tierId: string, billingCycle: TierInterval): PriceResolution => {
  const tierKey = tierId as TierId
  const raw = priceMap[tierKey]?.[billingCycle]
  if (!raw) {
    throw new Error(`Missing Stripe price value for tier "${tierId}" (${billingCycle}). Set STRIPE_PRICE_* env vars.`)
  }

  if (isStripePriceId(raw)) {
    return { type: "id", value: raw.trim() }
  }

  const normalized = Number(raw)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(
      `Invalid Stripe price value "${raw}" for tier "${tierId}" (${billingCycle}). Provide a price ID or numeric amount.`,
    )
  }

  return { type: "amount", value: normalized }
}
