import { stripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { upsertSubscription, upsertUserContact, findDiscordIdByStripeCustomerId } from "@/lib/db"
import type Stripe from "stripe"

type StripeSubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number | null
  current_period_end?: number | null
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""

const centsToMonthly = (unitAmount?: number | null, interval?: string) => {
  if (!unitAmount) return 0
  const amount = unitAmount / 100
  if (interval === "year") {
    return amount / 12
  }
  return amount
}

const extractGuildId = (metadata: Record<string, string | undefined>, fallback: string) => {
  return metadata.guildId || metadata.guild_id || metadata.discordGuildId || metadata.discordId || fallback
}

const handleSubscriptionUpsert = async (subscription: StripeSubscriptionWithPeriods) => {
  const metadata = subscription.metadata || {}
  const item = subscription.items?.data?.[0]
  const price = item?.price

  const monthlyPrice = centsToMonthly(price?.unit_amount, price?.recurring?.interval)
  const tierId = metadata.tierId || metadata.tier || price?.nickname || price?.id || "starter"
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer && typeof subscription.customer === "object"
        ? (subscription.customer as Stripe.Customer).id
        : null
  let discordId = metadata.discordId || metadata.userId || null
  if (!discordId && stripeCustomerId) {
    discordId = await findDiscordIdByStripeCustomerId(stripeCustomerId)
  }
  if (!discordId) {
    discordId = subscription.customer?.toString?.() ?? ""
  }
  const guildId = extractGuildId(metadata, discordId || subscription.id)
  const customerEmail =
    metadata.customerEmail ||
    subscription.customer_email ||
    subscription.customer_details?.email ||
    (typeof subscription.customer === "object" && subscription.customer
      ? ((subscription.customer as Stripe.Customer).email as string | null) || undefined
      : undefined)
  const customerPhone =
    metadata.customerPhone ||
    subscription.customer_details?.phone ||
    (typeof subscription.customer === "object" && subscription.customer
      ? ((subscription.customer as Stripe.Customer).phone as string | null) || undefined
      : undefined)

  await upsertSubscription({
    id: subscription.id,
    discordId: discordId || guildId,
    guildId,
    guildName: metadata.guildName || metadata.guild_name || price?.nickname || null,
    stripeCustomerId,
    tier: tierId,
    status: subscription.status,
    monthlyPrice,
    currentPeriodStart:
      typeof subscription.current_period_start === "number" ? new Date(subscription.current_period_start * 1000) : new Date(),
    currentPeriodEnd:
      typeof subscription.current_period_end === "number" ? new Date(subscription.current_period_end * 1000) : new Date(),
  })

  if (discordId || guildId) {
    await upsertUserContact({
      discordId: discordId || guildId,
      email: customerEmail ?? null,
      phone: customerPhone ?? null,
      stripeCustomerId: stripeCustomerId ?? undefined,
    })
  }
}

const ensureSubscriptionRecord = async (subscriptionId?: string | null) => {
  if (!subscriptionId || typeof subscriptionId !== "string") {
    return
  }
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price.product"],
    })
    await handleSubscriptionUpsert(subscription as StripeSubscriptionWithPeriods)
  } catch (error) {
    console.error("[VectoBeat] Failed to synchronize subscription:", subscriptionId, error)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature") || ""

  let event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    console.error("Webhook signature verification failed:", error)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscriptionWithPeriods
        await handleSubscriptionUpsert(subscription)
        break
      }

      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session
        await ensureSubscriptionRecord(checkoutSession.subscription as string | null)
        break
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
        await ensureSubscriptionRecord(typeof invoice.subscription === "string" ? invoice.subscription : null)
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
        await ensureSubscriptionRecord(typeof invoice.subscription === "string" ? invoice.subscription : null)
        break
      }

      default:
        console.log("[VectoBeat] Unhandled webhook event type:", event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
