import { NextResponse, type NextRequest } from "next/server"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { getUserPreferences } from "@/lib/db"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

const currency = (process.env.STRIPE_DEFAULT_CURRENCY || "eur").toLowerCase()
const MIN_CENTS = 50
const baseAmountCents = Math.max(MIN_CENTS, Number(process.env.DONATION_MIN_AMOUNT_CENTS || `${MIN_CENTS}`))
const maxAmountCents = Number(process.env.DONATION_MAX_AMOUNT_CENTS || "0")
const unitAmount = Math.floor(baseAmountCents)

const donationProduct = {
  name: process.env.DONATION_TITLE || "VectoBeat Donation",
  description:
    process.env.DONATION_DESCRIPTION ||
    "Support VectoBeat. Your donation helps cover hosting, moderation, and continued feature development.",
}

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

const parseAmountToCents = (value?: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(unitAmount, Math.floor(value * 100))
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."))
    if (Number.isFinite(parsed)) {
      return Math.max(unitAmount, Math.floor(parsed * 100))
    }
  }
  return null
}

const resolveLocale = (input?: unknown): string => {
  const requested = typeof input === "string" ? input.trim().toLowerCase() : ""
  const envLocale = typeof process.env.STRIPE_LOCALE === "string" ? process.env.STRIPE_LOCALE.trim().toLowerCase() : ""
  return allowedLocales.find((entry) => entry === requested) ?? allowedLocales.find((entry) => entry === envLocale) ?? "de"
}

const normalizeCountry = (value?: string | null): string | undefined => {
  if (!value || typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.toUpperCase().slice(0, 2)
}

const buildAddressFromPrefs = (prefs: any): Stripe.AddressParam | null => {
  const country = normalizeCountry(prefs?.addressCountry || null)
  if (!country) return null
  return {
    country,
    state: prefs?.addressState || undefined,
    city: prefs?.addressCity || undefined,
    line1: prefs?.addressStreet
      ? `${prefs.addressStreet}${prefs.addressHouseNumber ? " " + prefs.addressHouseNumber : ""}`
      : undefined,
    postal_code: prefs?.addressPostalCode || undefined,
  }
}

const findOrCreateCustomer = async (email?: string, name?: string | null, address?: Stripe.AddressParam | null) => {
  if (!email) return null
  const existing = await stripe.customers.list({ email, limit: 1 })
  const base = existing.data[0]
  if (base) {
    const updatePayload: Stripe.CustomerUpdateParams = {}
    if (name && name.trim() && name.trim() !== base.name) {
      updatePayload.name = name.trim()
    }
    if (address) {
      updatePayload.address = address
    }
    if (Object.keys(updatePayload).length > 0) {
      return stripe.customers.update(base.id, updatePayload)
    }
    return base
  }
  return stripe.customers.create({
    email,
    name: name?.trim() || undefined,
    address: address || undefined,
    metadata: { source: "donation" },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const source = typeof body?.source === "string" ? body.source.slice(0, 40) : "footer"
    const amountCents = parseAmountToCents(body?.amount)
    const locale = resolveLocale(body?.locale)
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
    const billingEmail = email
    let billingName = name || "VectoBeat supporter"
    let billingAddress: Stripe.AddressParam | null = null

    if (discordId) {
      const prefs = await getUserPreferences(discordId)
      billingName = billingName || prefs.fullName || ""
      billingAddress = buildAddressFromPrefs(prefs)
    }

    if (amountCents !== null && amountCents < MIN_CENTS) {
      return NextResponse.json({ error: "Minimum donation is €0.50." }, { status: 400 })
    }

    const effectiveAmountCents = amountCents && Number.isFinite(amountCents) ? amountCents : unitAmount

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency,
        unit_amount: effectiveAmountCents,
        product_data: {
          ...donationProduct,
          metadata: { category: "donation", source },
        },
        tax_behavior: "inclusive",
      },
      quantity: 1,
      adjustable_quantity: { enabled: false },
    }

    const customer = await findOrCreateCustomer(billingEmail || email, billingName || name, billingAddress)

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      billing_address_collection: "required",
      allow_promotion_codes: false,
      payment_method_types: ["card"],
      line_items: [lineItem],
      success_url: `${normalizedAppUrl}/success?donation=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${normalizedAppUrl}/failed?donation=1`,
      metadata: {
        category: "donation",
        source,
        ...(amountCents ? { amountCents: String(amountCents) } : {}),
      },
      payment_intent_data: {
        description: `${donationProduct.name} (${currency.toUpperCase()})`,
        metadata: {
          category: "donation",
          source,
          createdAt: new Date().toISOString(),
          ...(amountCents ? { amountCents: String(amountCents) } : {}),
        },
      },
      locale: locale as any,
      automatic_tax: { enabled: Boolean(billingAddress?.country) },
      customer_update: {
        address: "auto",
        name: "auto",
        shipping: "auto",
      },
    }

    if (customer?.id) {
      sessionPayload.customer = customer.id
    } else if (email) {
      sessionPayload.customer_email = email
    }

    const session = await stripe.checkout.sessions.create(sessionPayload)

    return NextResponse.json({ url: session.url }, { status: 200 })
  } catch (error) {
    console.error("[VectoBeat] Failed to create donation link:", error)
    const message = error instanceof Error ? error.message : "Donation link creation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
