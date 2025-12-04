import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { resolveStripePrice } from "@/lib/stripe-prices"
import { type NextRequest, NextResponse } from "next/server"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"
import { upsertUserContact } from "@/lib/db"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

const normalizeAddressInput = (input?: any): Stripe.AddressParam | undefined => {
  if (!input || typeof input !== "object") return undefined
  const { line1, line2, city, state, postalCode, postal_code, country } = input
  const sanitized: Stripe.AddressParam = {}
  if (typeof line1 === "string" && line1.trim()) sanitized.line1 = line1.trim()
  if (typeof line2 === "string" && line2.trim()) sanitized.line2 = line2.trim()
  if (typeof city === "string" && city.trim()) sanitized.city = city.trim()
  if (typeof state === "string" && state.trim()) sanitized.state = state.trim()
  const postal = typeof postalCode === "string" ? postalCode : typeof postal_code === "string" ? postal_code : undefined
  if (postal && postal.trim()) sanitized.postal_code = postal.trim()
  if (typeof country === "string" && country.trim()) sanitized.country = country.trim().toUpperCase()
  return Object.keys(sanitized).length ? sanitized : undefined
}

const getOrCreateCustomer = async (
  email: string,
  options?: { discordId?: string | null; name?: string | null; phone?: string | null; address?: Stripe.AddressParam },
) => {
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  })

  const baseCustomer =
    existing.data.length > 0
      ? existing.data[0]
      : await stripe.customers.create({
          email,
          metadata: {
            discordId: options?.discordId || "",
          },
        })

  const updatePayload: Stripe.CustomerUpdateParams = {}
  if (options?.name && options.name.trim() && options.name.trim() !== baseCustomer.name) {
    updatePayload.name = options.name.trim()
  }
  if (options?.phone && options.phone.trim() && options.phone.trim() !== baseCustomer.phone) {
    updatePayload.phone = options.phone.trim()
  }
  if (options?.address) {
    updatePayload.address = options.address
  }

  if (Object.keys(updatePayload).length > 0) {
    return stripe.customers.update(baseCustomer.id, updatePayload)
  }

  return baseCustomer
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      tierId,
      billingCycle = "monthly",
      customerEmail,
      discordId,
      guildId,
      guildName,
      customerName,
      customerPhone,
      billingAddress,
      locale: requestLocale,
      successPath,
      cancelPath,
    } = body

    if (!tierId || typeof tierId !== "string") {
      return NextResponse.json({ error: "Missing or invalid tierId" }, { status: 400 })
    }

    if (!["monthly", "yearly"].includes(billingCycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 })
    }

    if (!customerEmail || typeof customerEmail !== "string") {
      return NextResponse.json({ error: "Missing customer email" }, { status: 400 })
    }

    const priceResolution = resolveStripePrice(tierId, billingCycle)
    let priceId: string | null = priceResolution.type === "id" ? priceResolution.value : null

    const tierConfig = MEMBERSHIP_TIERS[tierId as keyof typeof MEMBERSHIP_TIERS]
    if (!tierConfig) {
      return NextResponse.json({ error: "Unknown tier selected" }, { status: 400 })
    }

    const amount =
      billingCycle === "monthly"
        ? tierConfig.monthlyPrice
        : tierConfig.yearlyPrice && tierConfig.yearlyPrice > 0
          ? tierConfig.yearlyPrice
          : tierConfig.monthlyPrice * 12
    if (!amount || Number.isNaN(amount)) {
      return NextResponse.json({ error: "Unable to determine plan price" }, { status: 400 })
    }

    const normalizedAddress = normalizeAddressInput(billingAddress)
    const customer = await getOrCreateCustomer(customerEmail, {
      discordId,
      name: typeof customerName === "string" ? customerName : null,
      phone: typeof customerPhone === "string" ? customerPhone : null,
      address: normalizedAddress,
    })
    const targetGuildId = typeof guildId === "string" && guildId.length > 0 ? guildId : discordId || ""
    const billingInterval: "month" | "year" = billingCycle === "monthly" ? "month" : "year"

    const currency = (process.env.STRIPE_DEFAULT_CURRENCY || "eur").toLowerCase()
    const locale = (typeof requestLocale === "string" && requestLocale.trim().toLowerCase()) || "de"

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem =
      priceId && priceId.startsWith("price_")
        ? {
          price: priceId,
          quantity: 1,
          adjustable_quantity: { enabled: false },
        }
        : {
          price_data: {
            currency,
            unit_amount: Math.round(priceResolution.type === "amount" ? priceResolution.value * 100 : amount * 100),
            recurring: {
              interval: billingInterval,
            },
            product_data: {
              name: `${tierConfig.name} (${billingCycle})` + (customerName ? ` — ${customerName}` : ""),
            },
          },
          quantity: 1,
          adjustable_quantity: { enabled: false },
        }

    const successUrlPath = typeof successPath === "string" && successPath.startsWith("/") ? successPath : "/success"
    const cancelUrlPath = typeof cancelPath === "string" && cancelPath.startsWith("/") ? cancelPath : "/failed"
    const successUrl = `${normalizedAppUrl}${successUrlPath}?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${normalizedAppUrl}${cancelUrlPath}?session_id={CHECKOUT_SESSION_ID}`
    const checkoutMetadata = {
      tierId,
      tierName: tierConfig.name,
      billingCycle,
      discordId: discordId || "",
      guildId: targetGuildId,
      guildName: guildName || "",
      customerEmail,
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      locale,
      ...(normalizedAddress?.country ? { billingCountry: normalizedAddress.country } : {}),
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customer.id,
      customer_update: {
        address: "auto",
        name: "auto",
        shipping: "auto",
      },
      line_items: [lineItem],
      subscription_data: {
        description: `${tierConfig.name} (${billingCycle}) for ${guildName || "Discord server"}`,
        metadata: {
          ...checkoutMetadata,
          createdAt: new Date().toISOString(),
        },
      },
      metadata: checkoutMetadata,
      billing_address_collection: "required",
      payment_method_collection: "always",
      locale: locale as Stripe.Checkout.SessionCreateParams.Locale,
      allow_promotion_codes: true,
      automatic_tax: {
        enabled: true,
      },
      tax_id_collection: {
        enabled: true,
      },
      phone_number_collection: {
        enabled: true,
      },
      consent_collection: {
        terms_of_service: "required",
      },
    }

    sessionParams.success_url = successUrl
    sessionParams.cancel_url = cancelUrl

    if (discordId) {
      await upsertUserContact({
        discordId,
        email: customer.email ?? customerEmail,
        phone: customer.phone ?? customerPhone ?? null,
        stripeCustomerId: customer.id,
      })
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json(
      {
        url: session.url ?? null,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[VectoBeat] Checkout error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Checkout failed: ${errorMessage}` }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session_id")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    })

    const subscription =
      typeof session.subscription === "string"
        ? null
        : (session.subscription as Stripe.Subscription & { current_period_end?: number | null }) ?? null

    const nextBilling =
      subscription?.current_period_end != null && typeof subscription.current_period_end === "number"
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null

    return NextResponse.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
      customerName: session.customer_details?.name ?? null,
      subscriptionId: subscription?.id ?? (typeof session.subscription === "string" ? session.subscription : null),
      nextBilling,
      metadata: session.metadata ?? {},
      tierId: session.metadata?.tierId ?? session.metadata?.tier ?? null,
      billingCycle: session.metadata?.billingCycle ?? null,
      guildId: session.metadata?.guildId ?? null,
      guildName: session.metadata?.guildName ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load checkout session"
    const status = message.toLowerCase().includes("no such checkout session") ? 404 : 500
    console.error("[VectoBeat] Checkout session lookup failed:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
