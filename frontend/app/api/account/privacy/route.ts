import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserPrivacy, updateUserPrivacy } from "@/lib/db"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchPrivacy?: typeof getUserPrivacy
  savePrivacy?: typeof updateUserPrivacy
}

export const createPrivacyHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchPrivacy = deps.fetchPrivacy ?? getUserPrivacy
  const savePrivacy = deps.savePrivacy ?? updateUserPrivacy

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const privacy = await fetchPrivacy(discordId)
    return NextResponse.json(privacy)
  }

  const putHandler = async (request: NextRequest) => {
    try {
      const { discordId, ...updates } = await request.json()
      if (!discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }

      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      const allowedKeys = ["profilePublic", "searchVisibility", "analyticsOptIn", "dataSharing"]
      const sanitized: Record<string, any> = {}
      for (const key of allowedKeys) {
        if (key in updates) {
          sanitized[key] = updates[key]
        }
      }

      const privacy = await savePrivacy(discordId, sanitized)
      return NextResponse.json(privacy)
    } catch (error) {
      console.error("[VectoBeat] Failed to update privacy:", error)
      return NextResponse.json({ error: "Failed to update privacy settings" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createPrivacyHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
