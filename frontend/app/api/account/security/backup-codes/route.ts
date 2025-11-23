import { type NextRequest, NextResponse } from "next/server"
import { listBackupCodes, regenerateBackupCodes } from "@/lib/db"
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

  const codes = await listBackupCodes(discordId)
  return NextResponse.json({ codes })
}

export async function POST(request: NextRequest) {
  const { discordId } = await request.json()
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const codes = await regenerateBackupCodes(discordId)
    return NextResponse.json({ codes })
  } catch (error) {
    console.error("[VectoBeat] Failed to regenerate backup codes:", error)
    return NextResponse.json({ error: "Encryption not configured" }, { status: 500 })
  }
}
