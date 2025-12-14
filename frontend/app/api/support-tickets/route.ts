import { type NextRequest, NextResponse } from "next/server"
import {
  appendContactMessageThread,
  createContactMessage,
  listContactMessagesByEmail,
  getUserContact,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendTicketEventEmail } from "@/lib/email-notifications"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contact = await getUserContact(discordId)
  const emailParam = request.nextUrl.searchParams.get("email")
  const email = (emailParam || contact.email || "").trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "No email on file for this account." }, { status: 400 })
  }

  const tickets = await listContactMessagesByEmail(email, 25, { scope: "ticket" })
  return NextResponse.json({ tickets })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
    const category = typeof body?.category === "string" ? body.category.trim() : "General"
    const priority = typeof body?.priority === "string" ? body.priority.trim() : "normal"
    const message = typeof body?.message === "string" ? body.message.trim() : ""
    const subjectInput = typeof body?.subject === "string" ? body.subject.trim() : ""

    if (!name || !discordId || !message) {
      return NextResponse.json({ error: "Name, discordId, and message are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const contact = await getUserContact(discordId)
    const email = (contact.email || body?.email || "").trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: "Please add an email to your account before submitting tickets." }, { status: 400 })
    }

    const subject = subjectInput || `[${category}][${priority}] Ticket`
    const isPartner = category.toLowerCase().includes("partner") || subject.toLowerCase().includes("partner")
    const ticket = await createContactMessage({
      name,
      email,
      subject,
      message,
      topic: category,
      priority,
      status: isPartner ? "waiting" : undefined,
    })
    if (ticket) {
      // Store the initial customer message in the thread to distinguish tickets from general contact entries.
      await appendContactMessageThread({
        ticketId: ticket.id,
        authorId: discordId,
        authorName: name,
        role: "member",
        body: message,
        attachments: null,
      })
      if (ticket.email) {
        void sendTicketEventEmail({
          to: ticket.email,
          customerName: ticket.name,
          ticketId: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          event: "created",
        })
      }
    }
    return NextResponse.json({ ticket })
  } catch (error) {
    console.error("[VectoBeat] Support ticket error:", error)
    return NextResponse.json({ error: "Unable to submit ticket" }, { status: 500 })
  }
}
