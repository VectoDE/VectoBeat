import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { getUserContact } from "@/lib/db"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

export async function POST(request: NextRequest) {
  try {
    const { discordId } = await request.json()
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const contact = await getUserContact(discordId)
    if (!contact?.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer is linked to this account yet." }, { status: 404 })
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: contact.stripeCustomerId,
      return_url: `${normalizedAppUrl}/account?billing=1`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error("[VectoBeat] Failed to create billing portal session:", error)
    return NextResponse.json({ error: "Unable to open billing portal." }, { status: 500 })
  }
}
