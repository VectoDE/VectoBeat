import { type NextRequest, NextResponse } from "next/server"
import { addNewsletterSubscriber } from "@/lib/db"
import { resolveClientIp } from "@/lib/request-metadata"
import { checkRateLimit, validateEmail } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const ip = resolveClientIp(request) ?? "unknown"
    if (!checkRateLimit(`newsletter:${ip}`, 3, 60000)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }

    const { email, name } = await request.json()
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!validateEmail(trimmedEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const sanitizedName = typeof name === "string" ? name.trim().slice(0, 200) : null
    await addNewsletterSubscriber(trimmedEmail, sanitizedName)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[VectoBeat] Newsletter subscribe failed:", error)
    return NextResponse.json({ error: "Unable to subscribe right now" }, { status: 500 })
  }
}
