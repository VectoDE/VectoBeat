import { type NextRequest, NextResponse } from "next/server"
import {
  createNewsletterCampaign,
  listNewsletterCampaigns,
  getUserRole,
  listNewsletterSubscribers,
  getUserContact,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendNewsletterEmail } from "@/lib/email-notifications"

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
  if (role !== "admin" && role !== "operator") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const includeSubscribers = request.nextUrl.searchParams.get("includeSubscribers") === "true"
  const [campaigns, subscribers] = await Promise.all([
    listNewsletterCampaigns(),
    includeSubscribers ? listNewsletterSubscribers() : Promise.resolve([]),
  ])

  return NextResponse.json(includeSubscribers ? { campaigns, subscribers } : { campaigns })
}

export async function POST(request: NextRequest) {
  try {
    const { discordId, subject, body } = await request.json()
    if (!discordId || !subject || !body) {
      return NextResponse.json({ error: "discordId, subject and body are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (role !== "admin" && role !== "operator") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const subscribers = await listNewsletterSubscribers()
    const contact = discordId ? await getUserContact(discordId) : null
    const sampleTargets = new Set<string>()
    if (contact?.email) {
      sampleTargets.add(contact.email)
    }
    if (process.env.NEWSLETTER_SAMPLE_EMAIL) {
      sampleTargets.add(process.env.NEWSLETTER_SAMPLE_EMAIL)
    }
    if (!sampleTargets.size && process.env.SMTP_FROM) {
      sampleTargets.add(process.env.SMTP_FROM)
    }

    const sampleResults: Array<{ email: string; delivered: boolean }> = []
    for (const email of sampleTargets) {
      const result = await sendNewsletterEmail({ to: email, subject, markdown: body, sample: true })
      sampleResults.push({ email, delivered: result.delivered })
    }

    let delivered = 0
    for (const subscriber of subscribers) {
      const result = await sendNewsletterEmail({ to: subscriber.email, subject, markdown: body })
      if (result.delivered) {
        delivered++
      }
    }

    const campaign = await createNewsletterCampaign({
      subject,
      body,
      sentBy: discordId,
      recipientCountOverride: subscribers.length,
    })
    if (!campaign) {
      return NextResponse.json({ error: "Failed to record campaign" }, { status: 500 })
    }

    return NextResponse.json({
      campaign,
      stats: {
        targeted: subscribers.length,
        delivered,
        samples: sampleResults,
      },
    })
  } catch (error) {
    console.error("[VectoBeat] Newsletter campaign error:", error)
    return NextResponse.json({ error: "Unable to create newsletter campaign" }, { status: 500 })
  }
}
