import { type NextRequest, NextResponse } from "next/server"
import { getUserSecurity, updateUserSecurity } from "@/lib/db"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const security = await getUserSecurity(discordId)
  return NextResponse.json(security)
}

export async function PUT(request: NextRequest) {
  try {
    const { discordId, ...updates } = await request.json()
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const allowedKeys = ["twoFactorEnabled", "loginAlerts", "twoFactorSecret", "lastPasswordChange"]
    const sanitized: Record<string, any> = {}
    for (const key of allowedKeys) {
      if (key in updates) {
        sanitized[key] = updates[key]
      }
    }

    const security = await updateUserSecurity(discordId, sanitized)
    return NextResponse.json(security)
  } catch (error) {
    console.error("[VectoBeat] Failed to update security settings:", error)
    return NextResponse.json({ error: "Failed to update security settings" }, { status: 500 })
  }
}
