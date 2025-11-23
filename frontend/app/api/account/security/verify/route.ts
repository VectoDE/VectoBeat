import { type NextRequest, NextResponse } from "next/server"
import { getUserSecurity, updateUserSecurity } from "@/lib/db"
import { verifyTwoFactorToken } from "@/lib/two-factor"

export async function POST(request: NextRequest) {
  try {
    const { discordId, token } = await request.json()
    if (!discordId || !token) {
      return NextResponse.json({ error: "discordId and token are required" }, { status: 400 })
    }

    const security = await getUserSecurity(discordId)
    if (!security.twoFactorSecret) {
      return NextResponse.json({ error: "Two-factor setup not initiated" }, { status: 400 })
    }

    if (!verifyTwoFactorToken(security.twoFactorSecret, token)) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 })
    }

    await updateUserSecurity(discordId, {
      twoFactorEnabled: true,
      backupCodesRemaining: security.backupCodesRemaining,
      loginAlerts: security.loginAlerts,
      activeSessions: security.activeSessions,
      lastPasswordChange: security.lastPasswordChange,
    })

    return NextResponse.json({ verified: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to verify 2FA code:", error)
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 })
  }
}
