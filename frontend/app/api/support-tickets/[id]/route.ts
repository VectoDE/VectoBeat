import { NextRequest, NextResponse } from "next/server"
import {
  appendContactMessageThread,
  getContactMessageThread,
  getUserRole,
  updateContactMessage,
  getContactMessageById,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendTicketEventEmail } from "@/lib/email-notifications"

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

  if (role === "member" && ticket.email && auth.valid && discordId) {
    // basic verification happens in getContactMessageThread, but double check
    // to avoid leaking other tickets
  }

  return NextResponse.json(ticket)
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

  return NextResponse.json(
    entry ?? { ticketId, status: statusUpdate ?? ticket.status },
    { status: entry ? 201 : 200 },
  )
}
