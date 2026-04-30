import { type NextRequest, NextResponse } from "next/server"
import { createContactMessage } from "@/lib/db"
import { resolveClientIp } from "@/lib/request-metadata"
import { checkRateLimit, sanitizeField, validateEmail } from "@/lib/security"

const MAX_MESSAGE_LENGTH = 5000

export async function POST(request: NextRequest) {
  try {
    const ip = resolveClientIp(request) ?? "unknown"
    if (!checkRateLimit(`contact:${ip}`, 5, 60000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }

    const body = await request.json()
    const name = sanitizeField(body.name)
    const email = sanitizeField(body.email)
    const subject = sanitizeField(body.subject)
    const message = sanitizeField(body.message, MAX_MESSAGE_LENGTH)
    const priority = sanitizeField(body.priority)
    const topic = sanitizeField(body.topic)
    const company = sanitizeField(body.company)

    if (!name || !email || !message || !priority || !topic) {
      return NextResponse.json({ error: "Name, email, topic, priority, and message are required" }, { status: 400 })
    }

    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    await createContactMessage({ name, email, subject, message, priority, topic, company })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to create contact message:", error)
    return NextResponse.json({ error: "Unable to send message right now" }, { status: 500 })
  }
}
