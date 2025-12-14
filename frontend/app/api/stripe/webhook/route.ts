import { NextResponse, type NextRequest } from "next/server"
import Stripe from "stripe"
import { upsertSubscription } from "@/lib/db"
import { deliverTelemetryWebhook } from "@/lib/telemetry-webhooks"

const stripeSecret = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

if (!stripeSecret) {
  throw new Error("STRIPE_SECRET_KEY is not set")
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2025-11-17.clover",
  appInfo: { name: "VectoBeat", version: "2.3.0" },
})

const parseTier = (subscription: Stripe.Subscription): string => {
  const metaTier =
    (subscription.metadata?.tier as string | undefined) ||
    (subscription.items?.data?.[0]?.price?.metadata?.tier as string | undefined) ||
    (subscription.items?.data?.[0]?.price?.product as any)?.metadata?.tier
  if (metaTier && typeof metaTier === "string") {
    return metaTier.toLowerCase()
  }
  const nickname = subscription.items?.data?.[0]?.price?.nickname
  if (nickname) {
    return String(nickname).toLowerCase().split(" ")[0]
  }
  return "starter"
}

const normalizeGuildId = (subscription: Stripe.Subscription) => {
  const metaGuild =
    subscription.metadata?.guildId ||
    subscription.metadata?.guild_id ||
    subscription.metadata?.discord_guild_id ||
    subscription.metadata?.serverId
  return typeof metaGuild === "string" ? metaGuild : ""
}

const normalizeDiscordId = (subscription: Stripe.Subscription) => {
  const metaUser =
    subscription.metadata?.discordId ||
    subscription.metadata?.discord_id ||
    subscription.metadata?.userId ||
    subscription.metadata?.owner
  return typeof metaUser === "string" ? metaUser : ""
}

const buildPayload = (subscription: Stripe.Subscription) => {
  const tier = parseTier(subscription)
  const guildId = normalizeGuildId(subscription)
  const discordId = normalizeDiscordId(subscription)
  const status = subscription.status === "canceled" ? "canceled" : subscription.status
  const item = subscription.items?.data?.[0]
  const price = item?.price?.unit_amount ?? 0
  const currency = item?.price?.currency || "usd"
  const monthlyPrice = typeof price === "number" ? price / 100 : 0

  return {
    id: subscription.id,
    discordId,
    guildId,
    guildName: subscription.metadata?.guildName || subscription.metadata?.guild_name || null,
    stripeCustomerId: subscription.customer as string,
    tier,
    status,
    monthlyPrice,
    currency,
    // Stripe types omit these on Subscription in TS; they are present in payloads
    currentPeriodStart: new Date((((subscription as any)?.current_period_start ?? Date.now()) as number) * 1000),
    currentPeriodEnd: new Date((((subscription as any)?.current_period_end ?? Date.now()) as number) * 1000),
  }
}

const handleSubscriptionEvent = async (subscription: Stripe.Subscription) => {
  const payload = buildPayload(subscription)
  if (!payload.guildId || !payload.discordId) {
    return { ok: false, error: "missing_metadata" }
  }
  const record = await upsertSubscription(payload)
  const guildId = (record as any)?.discordServerId || payload.guildId
  if (guildId) {
    void deliverTelemetryWebhook({
      guildId,
      event: "billing_usage",
      payload: {
        status: payload.status,
        tier: payload.tier,
        monthlyPrice: payload.monthlyPrice,
        currency: payload.currency,
        periodEnd: payload.currentPeriodEnd,
        periodStart: payload.currentPeriodStart,
        stripeSubscriptionId: payload.id,
        stripeCustomerId: payload.stripeCustomerId,
      },
      source: "billing",
    })
  }
  return { ok: Boolean(record), record }
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 })
  }

  const signature = request.headers.get("stripe-signature")
  const rawBody = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_signature"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionEvent(subscription)
        break
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription as { id?: string } | null)?.id
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            await handleSubscriptionEvent(subscription)
          }
        }
        break
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id?: string } | null }
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : (invoice.subscription as { id?: string } | null)?.id
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          await handleSubscriptionEvent(subscription)
        }
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error("[VectoBeat] Stripe webhook handling failed:", error)
    return NextResponse.json({ error: "webhook_failure" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
