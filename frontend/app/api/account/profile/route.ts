import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getAccountProfileSettings, updateAccountProfileSettings } from "@/lib/db"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchProfile?: typeof getAccountProfileSettings
  saveProfile?: typeof updateAccountProfileSettings
}

export const createProfileHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchProfile = deps.fetchProfile ?? getAccountProfileSettings
  const saveProfile = deps.saveProfile ?? updateAccountProfileSettings

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const profile = await fetchProfile(discordId)
    return NextResponse.json(profile)
  }

  const putHandler = async (request: NextRequest) => {
    try {
      const { discordId, ...rest } = await request.json()
      if (!discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }

      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      const allowedKeys = ["displayName", "headline", "bio", "location", "website", "handle"]
      const sanitized: Record<string, any> = {}
      for (const key of Object.keys(rest)) {
        if (allowedKeys.includes(key)) {
          sanitized[key] = rest[key]
        }
      }

      const profile = await saveProfile(discordId, sanitized)
      return NextResponse.json(profile)
    } catch (error) {
      console.error("[VectoBeat] Failed to update profile settings:", error)
      return NextResponse.json({ error: (error as Error).message || "Unable to update profile" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createProfileHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
