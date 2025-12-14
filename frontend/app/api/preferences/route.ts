import { type NextRequest, NextResponse } from "next/server"
import { getUserPreferences, updateUserPreferences } from "@/lib/db"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId query param required" }, { status: 400 })
  }

  const prefs = await getUserPreferences(discordId)
  return NextResponse.json(prefs)
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { discordId, ...updates } = body
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
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
