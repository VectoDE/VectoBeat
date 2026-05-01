import { type NextRequest, NextResponse } from "next/server"
import { getUserSecurity, updateUserSecurity } from "@/lib/db"
import { requireAuth, verifyRequestForUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const result = await requireAuth(request)
  if (!result.ok) return result.response

  const security = await getUserSecurity(result.discordId)
  return NextResponse.json(security)
}

export async function PUT(request: NextRequest) {
  try {
    const { discordId, ...updates } = await request.json()
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
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
