import { type NextRequest, NextResponse } from "next/server"
import { getActiveSessions, revokeUserSession, getUserContact } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sessions = await getActiveSessions(discordId)
  return NextResponse.json({ sessions })
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { discordId, sessionId } = body || {}

    if (!discordId || !sessionId) {
      return NextResponse.json({ error: "discordId and sessionId are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const success = await revokeUserSession(discordId, sessionId)
    return NextResponse.json({ success })
  } catch (error) {
    console.error("[VectoBeat] Failed to remove session:", error)
    return NextResponse.json({ error: "Failed to remove session" }, { status: 500 })
  }
}
