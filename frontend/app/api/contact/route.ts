import { type NextRequest, NextResponse } from "next/server"
import { createContactMessage } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message, priority, topic, company } = await request.json()
    if (!name || !email || !message || !priority || !topic) {
      return NextResponse.json({ error: "Name, email, topic, priority, and message are required" }, { status: 400 })
    }

    await createContactMessage({ name, email, subject, message, priority, topic, company })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to create contact message:", error)
    return NextResponse.json({ error: "Unable to send message right now" }, { status: 500 })
  }
}
