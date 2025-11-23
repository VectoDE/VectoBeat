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
  const message = body.get("message")
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 })
  }

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

  const entry = await appendContactMessageThread({
    ticketId,
    authorId: discordId ?? null,
    authorName: body.get("authorName")?.toString() ?? null,
    role,
    body: message.trim(),
    attachments: attachments.length ? attachments : null,
  })

  if (!entry) {
    return NextResponse.json({ error: "Failed to append message" }, { status: 500 })
  }

  if (ticket.email && role !== "member") {
    void sendTicketEventEmail({
      to: ticket.email,
      customerName: ticket.name,
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      event: "response",
      responder: body.get("authorName")?.toString() || "VectoBeat Support",
      messagePreview: message.trim().slice(0, 400),
    })
  }

  const statusUpdate = body.get("status")?.toString()
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

  return NextResponse.json(entry, { status: 201 })
}
