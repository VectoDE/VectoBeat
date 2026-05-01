import { type NextRequest, NextResponse } from "next/server"
import { getUserPreferences, updateUserPreferences } from "@/lib/db"
import { requireAuth, verifyRequestForUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const result = await requireAuth(request)
  if (!result.ok) return result.response

  const prefs = await getUserPreferences(result.discordId)
  return NextResponse.json(prefs)
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { discordId, ...updates } = body
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const allowedKeys = [
      "emailUpdates",
      "productUpdates",
      "weeklyDigest",
      "smsAlerts",
      "preferredLanguage",
      "fullName",
      "birthDate",
      "addressCountry",
      "addressState",
      "addressCity",
      "addressStreet",
      "addressHouseNumber",
      "addressPostalCode",
    ]
    const sanitizedUpdates: Record<string, any> = {}

    for (const key of allowedKeys) {
      if (key in updates) {
        sanitizedUpdates[key] = updates[key]
      }
    }

    const prefs = await updateUserPreferences(discordId, sanitizedUpdates)
    return NextResponse.json(prefs)
  } catch (error) {
    console.error("[VectoBeat] Failed to update preferences:", error)
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 })
  }
}
