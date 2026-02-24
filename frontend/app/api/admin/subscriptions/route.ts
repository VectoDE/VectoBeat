import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { verifyRequestForUser } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { ensureStripeCustomerForUser } from "@/lib/stripe-customers"
import { getUserContact, getUserRole, listAllSubscriptions, updateSubscriptionById, upsertSubscription, upsertUserContact } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const isPrivileged = (role: string) => role === "admin" || role === "operator"
const defaultCurrency = (process.env.STRIPE_DEFAULT_CURRENCY || "eur").toLowerCase()

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = await getUserRole(discordId)
  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const subscriptions = await listAllSubscriptions()
  return NextResponse.json({ subscriptions })
}

export async function POST(request: NextRequest) {
  try {
    const { discordId, updates } = await request.json()
    if (!discordId || !updates) {
      return NextResponse.json({ error: "discordId and updates are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (!isPrivileged(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const targetDiscordId =
      typeof updates.discordId === "string" && updates.discordId.trim().length
        ? updates.discordId.trim()
        : discordId
    const guildId = updates.discordServerId || updates.guildId
    if (!guildId) {
      return NextResponse.json({ error: "discordServerId (guild) is required" }, { status: 400 })
    }

    const normalizedTier = normalizeTierId(updates.tier || "starter")
    const monthlyPrice =
      typeof updates.pricePerMonth === "number" && Number.isFinite(updates.pricePerMonth) ? updates.pricePerMonth : 0
    if (monthlyPrice <= 0) {
      return NextResponse.json({ error: "pricePerMonth must be greater than 0 to create a Stripe subscription" }, { status: 400 })
    }

    const contact = await getUserContact(targetDiscordId)
    const stripeCustomerId =
      (typeof updates.stripeCustomerId === "string" && updates.stripeCustomerId.trim()) ||
      (await ensureStripeCustomerForUser({
        discordId: targetDiscordId,
        email: contact?.email ?? undefined,
        phone: contact?.phone ?? undefined,
        name: updates.guildName || updates.name || null,
        contact,
      }))

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "Unable to resolve or create Stripe customer" }, { status: 500 })
    }

    await upsertUserContact({ discordId: targetDiscordId, stripeCustomerId })

    const parseDate = (value: any) => {
      const date = value ? new Date(value) : null
      return date && !Number.isNaN(date.getTime()) ? date : null
    }

    let stripeSubscription: Stripe.Subscription
    try {
      let stripeProductId = updates.stripeProductId
      if (!stripeProductId) {
        const product = await stripe.products.create({
          name: `${normalizedTier.toUpperCase()} — ${updates.name || updates.guildName || guildId}`,
          metadata: {
            tier: normalizedTier,
            guildId,
            source: "admin_portal_manual",
          },
        })
        stripeProductId = product.id
      }

      stripeSubscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        description: `Admin-created ${normalizedTier} subscription for guild ${guildId}`,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        collection_method: "charge_automatically",
        metadata: {
          discordId: targetDiscordId,
          guildId,
          guildName: updates.name || updates.guildName || "",
          tier: normalizedTier,
          createdBy: discordId,
          source: "admin_portal",
        },
        items: [
          {
            price_data: {
              currency: defaultCurrency,
              unit_amount: Math.round(monthlyPrice * 100),
              recurring: { interval: "month" },
              product: stripeProductId,
            },
          },
        ],
      })
    } catch (stripeError: any) {
      console.error("[VectoBeat] Stripe subscription creation failed:", stripeError)
      return NextResponse.json(
        {
          error: "Stripe creation failed",
          details: stripeError.message || "Unknown Stripe error",
        },
        { status: 400 },
      )
    }

    const currentPeriodStart =
      typeof (stripeSubscription as any).current_period_start === "number"
        ? new Date((stripeSubscription as any).current_period_start * 1000)
        : parseDate(updates.currentPeriodStart) ?? new Date()
    const currentPeriodEnd =
      typeof (stripeSubscription as any).current_period_end === "number"
        ? new Date((stripeSubscription as any).current_period_end * 1000)
        : parseDate(updates.currentPeriodEnd) ?? new Date()

    try {
      const subscription = await upsertSubscription({
        id: stripeSubscription.id || updates.subscriptionId || updates.id || `manual_${randomUUID()}`,
        discordId: targetDiscordId,
        guildId,
        guildName: updates.name ?? updates.guildName ?? null,
        stripeCustomerId,
        tier: normalizedTier,
        status: stripeSubscription.status || updates.status || "active",
        monthlyPrice,
        currentPeriodStart,
        currentPeriodEnd,
      })

      if (!subscription) {
        throw new Error("Database upsert returned null")
      }

      return NextResponse.json({ subscription })
    } catch (dbError: any) {
      console.error("[VectoBeat] Database subscription sync failed:", dbError)
      return NextResponse.json(
        {
          error: "Database sync failed",
          details: dbError.message || "Unknown database error",
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("[VectoBeat] Unexpected failure in subscription creation:", error)
    return NextResponse.json(
      {
        error: "Unable to create subscription",
        details: error.message || "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { discordId, subscriptionId, updates } = await request.json()
    if (!discordId || !subscriptionId || !updates) {
      return NextResponse.json({ error: "discordId, subscriptionId, and updates are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (!isPrivileged(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const payload: Record<string, any> = {}
    if (typeof updates.status === "string") {
      payload.status = updates.status
    }
    if (typeof updates.tier === "string") {
      payload.tier = updates.tier
    }
    if (typeof updates.pricePerMonth === "number" && Number.isFinite(updates.pricePerMonth)) {
      payload.monthlyPrice = updates.pricePerMonth
    }
    if (typeof updates.guildName === "string" || updates.guildName === null) {
      payload.guildName = updates.guildName
    }
    if (typeof updates.currentPeriodStart === "string") {
      payload.currentPeriodStart = new Date(updates.currentPeriodStart)
    }
    if (typeof updates.currentPeriodEnd === "string") {
      payload.currentPeriodEnd = new Date(updates.currentPeriodEnd)
    }

    const updated = await updateSubscriptionById(subscriptionId, payload)
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    return NextResponse.json({ subscription: updated })
  } catch (error) {
    console.error("[VectoBeat] Failed to update subscription:", error)
    return NextResponse.json({ error: "Unable to update subscription" }, { status: 500 })
  }
}
