import { type NextRequest, NextResponse } from "next/server"
import { getUserRole, listContactMessages, updateContactMessage } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendContactReplyEmail } from "@/lib/email-notifications"

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

  const messages = await listContactMessages({ scope: "contact" })
  return NextResponse.json({ messages })
}

export async function PUT(request: NextRequest) {
  try {
    const { discordId, messageId, status, response, priority } = await request.json()
    if (!discordId || !messageId) {
      return NextResponse.json({ error: "discordId and messageId are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const role = await getUserRole(discordId)
    if (role !== "admin" && role !== "operator") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const updated = await updateContactMessage(messageId, {
      status,
      response,
      priority,
      respondedBy: response ? discordId : undefined,
    })
    if (!updated) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 })
    }
    if (updated.email && response) {
      void sendContactReplyEmail({
        to: updated.email,
        name: updated.name,
        subject: updated.subject,
        message: response,
      })
    }
    return NextResponse.json({ message: updated })
  } catch (error) {
    console.error("[VectoBeat] Failed to update contact message:", error)
    return NextResponse.json({ error: "Unable to update message" }, { status: 500 })
  }
}
