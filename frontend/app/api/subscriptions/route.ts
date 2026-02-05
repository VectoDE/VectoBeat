import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getUserSubscriptions,
  getUserContact,
  upsertSubscription,
  upsertUserContact,
  type SubscriptionSummary,
} from "@/lib/db"
import { stripe } from "@/lib/stripe"

const centsToMonthly = (unitAmount?: number | null, interval?: string | null) => {
  if (!unitAmount) return 0
  const amount = unitAmount / 100
  if (interval === "year") {
    return amount / 12
  }
  return amount
}

const resolveStripeCustomerId = async (discordId: string) => {
  const contact = await getUserContact(discordId)
  if (contact && "stripeCustomerId" in contact && contact.stripeCustomerId) {
    return { contact, stripeCustomerId: contact.stripeCustomerId }
  }

  const fallbackEmail = contact?.email
  if (!fallbackEmail) {
    return { contact, stripeCustomerId: null }
  }

  const candidates = await stripe.customers.list({ email: fallbackEmail, limit: 1 })
  const customer = candidates.data[0]
  if (customer?.id) {
    await upsertUserContact({
      discordId,
      email: customer.email ?? fallbackEmail,
      phone: customer.phone ?? contact?.phone ?? null,
      stripeCustomerId: customer.id,
    })
    return { contact: { ...contact, stripeCustomerId: customer.id }, stripeCustomerId: customer.id }
  }

  return { contact, stripeCustomerId: null }
}

const syncSubscriptionsFromStripe = async (discordId: string) => {
  const { stripeCustomerId } = await resolveStripeCustomerId(discordId)
  if (!stripeCustomerId) {
    return
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
    expand: ["data.items"],
  })

  await Promise.all(
    subscriptions.data.map((subscription: any) => {
      const item = subscription.items.data[0]
      const price = item?.price
      const metadata = subscription.metadata || {}
      const monthlyPrice = centsToMonthly(price?.unit_amount, price?.recurring?.interval)
      const tierId = metadata.tierId || metadata.tier || price?.nickname || price?.id || "starter"
      const guildId = metadata.guildId || metadata.guild_id || discordId
      const guildName = metadata.guildName || metadata.guild_name || price?.nickname || null

      const currentPeriodStartTs = (subscription as any)?.current_period_start
      const currentPeriodEndTs = (subscription as any)?.current_period_end

      return upsertSubscription({
        id: subscription.id,
        discordId,
        guildId,
        guildName,
        stripeCustomerId,
        tier: tierId,
        status: subscription.status,
        monthlyPrice,
        currentPeriodStart:
          typeof currentPeriodStartTs === "number"
            ? new Date(currentPeriodStartTs * 1000)
            : new Date(),
        currentPeriodEnd:
          typeof currentPeriodEndTs === "number"
            ? new Date(currentPeriodEndTs * 1000)
            : new Date(),
      })
    }),
  )
}

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  syncFromStripe?: typeof syncSubscriptionsFromStripe
  fetchSubscriptions?: typeof getUserSubscriptions
}

export const createSubscriptionsHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const syncFromStripe = deps.syncFromStripe ?? syncSubscriptionsFromStripe
  const fetchSubscriptions = deps.fetchSubscriptions ?? getUserSubscriptions

  const getHandler = async (request: NextRequest) => {
    try {
      const userId = request.nextUrl.searchParams.get("userId")

      if (!userId) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 })
      }

      const auth = await verifyUser(request, userId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      try {
        await syncFromStripe(userId)
      } catch (syncError) {
        console.error("[VectoBeat] Failed to sync Stripe subscriptions:", syncError)
      }

      const subscriptions = await fetchSubscriptions(userId)

      return NextResponse.json({
        subscriptions,
        total: subscriptions.length,
        activeCount: subscriptions.filter((sub: SubscriptionSummary) => sub.status === "active").length,
      })
    } catch (error) {
      console.error("[VectoBeat] Get subscriptions error:", error)
      return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 })
    }
  }

  const postHandler = async () =>
    NextResponse.json(
      { error: "Subscriptions are provisioned automatically after successful Stripe checkout." },
      { status: 405 },
    )

  return { GET: getHandler, POST: postHandler }
}

const defaultHandlers = createSubscriptionsHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST
