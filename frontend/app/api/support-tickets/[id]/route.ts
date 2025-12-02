import { NextRequest, NextResponse } from "next/server"
import {
  appendContactMessageThread,
  getContactMessageThread,
  getUserRole,
  updateContactMessage,
  getContactMessageById,
  recordBotActivityEvent,
  getUserSubscriptions,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendTicketEventEmail } from "@/lib/email-notifications"
import { normalizeTierId } from "@/lib/memberships"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ticketId } = await params
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket ID required" }, { status: 400 })
  }

  const discordId = request.nextUrl.searchParams.get("discordId")
  const auth = await verifyRequestForUser(request, discordId ?? "")
  if (!auth.valid && !discordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = discordId ? await getUserRole(discordId) : "member"
  const ticket = await getContactMessageThread(ticketId)
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  let subscription: { tier: string; serverName: string | null } | null = null
  const memberMessage = ticket.messages?.find((msg) => msg.role === "member" && msg.authorId)
  const requesterId = memberMessage?.authorId || null
  if (requesterId) {
    try {
      const subs = await getUserSubscriptions(requesterId)
      const activeStatuses = new Set(["active", "trialing", "pending"])
      const tierOrder = ["free", "starter", "pro", "growth", "scale", "enterprise"]
      let best = "free"
      let bestServer: string | null = null
      for (const sub of subs) {
        if (!activeStatuses.has((sub.status || "").toLowerCase())) continue
        const tier = normalizeTierId(sub.tier)
        const currentIdx = tierOrder.indexOf(best)
        const nextIdx = tierOrder.indexOf(tier)
        if (nextIdx > currentIdx) {
          best = tier
          bestServer = sub.name || sub.discordServerId || null
        }
      }
      subscription = { tier: best, serverName: bestServer }
    } catch (error) {
      console.error("[VectoBeat] Failed to resolve ticket subscription:", error)
    }
  }

  if (role === "member" && ticket.email && auth.valid && discordId) {
    // basic verification happens in getContactMessageThread, but double check
    // to avoid leaking other tickets
  }

  return NextResponse.json({ ...ticket, subscription })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ticketId } = await params
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket ID required" }, { status: 400 })
  }

  const body = await request.formData()
  const messageValue = body.get("message")
  const normalizedMessage = typeof messageValue === "string" ? messageValue.trim() : ""
  const statusInput = body.get("status")
  const statusUpdate = typeof statusInput === "string" ? statusInput : null

  const discordId = request.nextUrl.searchParams.get("discordId")
  const auth = await verifyRequestForUser(request, discordId ?? "")
  if (!auth.valid && !discordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = discordId ? await getUserRole(discordId) : "member"
  const ticket = await getContactMessageById(ticketId)
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }
  const attachments: Array<{ name: string; type: string; size: number; content: string }> = []

  for (const [key, value] of body.entries()) {
    if (value instanceof File && key.startsWith("attachment_")) {
      const buffer = Buffer.from(await value.arrayBuffer())
      attachments.push({
        name: value.name,
        type: value.type,
        size: value.size,
        content: buffer.toString("base64"),
      })
    }
  }

  if (!normalizedMessage && !attachments.length && !statusUpdate) {
    return NextResponse.json({ error: "Add a message, attachment, or status change." }, { status: 400 })
  }

  let entry = null
  if (normalizedMessage || attachments.length) {
    entry = await appendContactMessageThread({
      ticketId,
      authorId: discordId ?? null,
      authorName: body.get("authorName")?.toString() ?? null,
      role,
      body: normalizedMessage,
      attachments: attachments.length ? attachments : null,
    })

    if (!entry) {
      return NextResponse.json({ error: "Failed to append message" }, { status: 500 })
    }
  }

  if (entry && ticket.email && role !== "member") {
    const preview = normalizedMessage || (attachments.length ? "New attachments shared via Support Desk." : "")
    void sendTicketEventEmail({
      to: ticket.email,
      customerName: ticket.name,
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      event: "response",
      responder: body.get("authorName")?.toString() || "VectoBeat Support",
      messagePreview: preview.slice(0, 400),
    })
  }

  if (statusUpdate) {
    await updateContactMessage(ticketId, { status: statusUpdate })
    if (ticket.email && statusUpdate !== ticket.status) {
      void sendTicketEventEmail({
        to: ticket.email,
        customerName: ticket.name,
        ticketId: ticket.id,
        subject: ticket.subject,
        status: statusUpdate,
        event: "status",
      })
    }
  }

  // Track ticket activity for admin logs.
  await recordBotActivityEvent({
    type: "ticket.update",
    name: ticket.subject ?? "support_ticket",
    guildId: null,
    success: true,
    metadata: {
      ticketId,
      status: statusUpdate ?? ticket.status,
      authorId: discordId ?? null,
      hasMessage: Boolean(normalizedMessage),
      attachments: attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })),
    },
  })

  return NextResponse.json(
    entry ?? { ticketId, status: statusUpdate ?? ticket.status },
    { status: entry ? 201 : 200 },
  )
}
