import { type NextRequest, NextResponse } from "next/server"
import { getUserSecurity, updateUserSecurity } from "@/lib/db"
import { generateTwoFactorSecret } from "@/lib/two-factor"

export async function GET(request: NextRequest) {
  try {
    const discordId = request.nextUrl.searchParams.get("discordId")
    const username = request.nextUrl.searchParams.get("username") || "VectoBeat"
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const existing = await getUserSecurity(discordId)
    if (existing.twoFactorSecret) {
      return NextResponse.json({
        secret: existing.twoFactorSecret,
        otpauth: generateTwoFactorSecret(username).otpauth.replace(/secret=.*?&/, `secret=${existing.twoFactorSecret}&`),
      })
    }

    const { secret, otpauth } = generateTwoFactorSecret(`${username} (${discordId})`)
    await updateUserSecurity(discordId, {
      twoFactorSecret: secret,
      twoFactorEnabled: false,
    })

    return NextResponse.json({ secret, otpauth })
  } catch (error) {
    console.error("[VectoBeat] Failed to create 2FA secret:", error)
    return NextResponse.json({ error: "Failed to generate 2FA secret" }, { status: 500 })
  }
}
