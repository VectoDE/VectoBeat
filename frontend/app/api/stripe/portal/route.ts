import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { type NextRequest, NextResponse } from "next/server"
import { getUserContact } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

const appUrl =
    process.env.NEXT_PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

export async function POST(request: NextRequest) {
    try {
        const { discordId, returnUrl: customReturnUrl } = await request.json()

        if (!discordId) {
            return NextResponse.json({ error: "discordId is required" }, { status: 400 })
        }

        const auth = await verifyRequestForUser(request, discordId)
        if (!auth.valid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const contact = await getUserContact(discordId)
        if (!contact || !(contact as any).stripeCustomerId) {
            return NextResponse.json(
                { error: "No billing profile found. Please create a subscription first." },
                { status: 404 },
            )
        }

        const returnUrl = customReturnUrl || `${normalizedAppUrl}/account`

        const session = await stripe.billingPortal.sessions.create({
            customer: (contact as any).stripeCustomerId,
            return_url: returnUrl,
        })

        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error("[VectoBeat] Billing portal error:", error)
        return NextResponse.json({ error: "Failed to create billing portal session" }, { status: 500 })
    }
}
