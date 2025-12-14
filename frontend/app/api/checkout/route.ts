import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { resolveStripePrice } from "@/lib/stripe-prices"
import { type NextRequest, NextResponse } from "next/server"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"
import { upsertUserContact, getUserPreferences } from "@/lib/db"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

const normalizeCountry = (value?: string | null): string | undefined => {
  if (!value || typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.toUpperCase().slice(0, 2)
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

    const normalizedCountry = normalizeCountry(billingAddress?.country as string | undefined)
    const normalizedAddress: Stripe.AddressParam | undefined = billingAddress
      ? {
          country: normalizedCountry,
          state: typeof billingAddress.state === "string" ? billingAddress.state.trim() : undefined,
          city: typeof billingAddress.city === "string" ? billingAddress.city.trim() : undefined,
          line1: typeof billingAddress.line1 === "string" ? billingAddress.line1.trim() : undefined,
          line2: typeof (billingAddress as any).line2 === "string" ? (billingAddress as any).line2.trim() : undefined,
          postal_code:
            typeof (billingAddress as any).postalCode === "string"
              ? (billingAddress as any).postalCode.trim()
              : typeof (billingAddress as any).postal_code === "string"
                ? (billingAddress as any).postal_code.trim()
                : undefined,
        }
      : undefined

    const preferences = discordId ? await getUserPreferences(discordId) : null
    const preferenceCountry = normalizeCountry(preferences?.addressCountry || null)
    const preferenceAddress: Stripe.AddressParam | undefined =
      preferenceCountry
        ? {
            country: preferenceCountry,
            state: preferences?.addressState || undefined,
            city: preferences?.addressCity || undefined,
            line1: preferences?.addressStreet
              ? `${preferences.addressStreet}${preferences.addressHouseNumber ? " " + preferences.addressHouseNumber : ""}`
              : undefined,
            postal_code: preferences?.addressPostalCode || undefined,
          }
        : undefined

    const resolvedAddress = normalizedAddress || preferenceAddress
    const customer = await getOrCreateCustomer(customerEmail, {
      discordId,
      name:
        typeof customerName === "string" && customerName.trim()
          ? customerName
          : preferences?.fullName?.trim()
            ? preferences.fullName.trim()
            : null,
      phone: typeof customerPhone === "string" ? customerPhone : null,
      address: resolvedAddress,
    })
    const targetGuildId = typeof guildId === "string" && guildId.length > 0 ? guildId : discordId || ""
    const billingInterval: "month" | "year" = billingCycle === "monthly" ? "month" : "year"

    const currency = (process.env.STRIPE_DEFAULT_CURRENCY || "eur").toLowerCase()
    const allowedLocales = [
      "auto",
      "bg",
      "cs",
      "da",
      "de",
      "el",
      "en",
      "en-gb",
      "es",
      "es-419",
      "et",
      "fi",
      "fil",
      "fr",
      "fr-ca",
      "hr",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "lt",
      "lv",
      "ms",
      "mt",
      "nb",
      "nl",
      "pl",
      "pt",
      "pt-br",
      "ro",
      "ru",
      "sk",
      "sl",
      "sv",
      "th",
      "tr",
      "vi",
      "zh",
      "zh-hk",
      "zh-tw",
    ]
    const requestedLocale = typeof requestLocale === "string" ? requestLocale.trim().toLowerCase() : ""
    const envLocale = typeof process.env.STRIPE_LOCALE === "string" ? process.env.STRIPE_LOCALE.trim().toLowerCase() : ""
    const locale =
      allowedLocales.find((entry) => entry === requestedLocale) ??
      allowedLocales.find((entry) => entry === envLocale) ??
      "de"

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
        address: resolvedAddress ? "auto" : undefined,
        name: "auto",
        shipping: resolvedAddress ? "auto" : undefined,
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
        enabled: Boolean(resolvedAddress?.country),
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
