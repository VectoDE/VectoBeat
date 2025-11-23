import { type NextRequest, NextResponse } from "next/server"
import { addNewsletterSubscriber } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    await addNewsletterSubscriber(email, typeof name === "string" ? name : null)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[VectoBeat] Newsletter subscribe failed:", error)
    return NextResponse.json({ error: "Unable to subscribe right now" }, { status: 500 })
  }
}
