import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getBotSettings, updateBotSettings } from "@/lib/db"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchBotSettings?: typeof getBotSettings
  saveBotSettings?: typeof updateBotSettings
}

export const createBotSettingsHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchBotSettings = deps.fetchBotSettings ?? getBotSettings
  const saveBotSettings = deps.saveBotSettings ?? updateBotSettings

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const settings = await fetchBotSettings(discordId)
    return NextResponse.json(settings)
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

      const settings = await saveBotSettings(discordId, updates)
      return NextResponse.json(settings)
    } catch (error) {
      console.error("[VectoBeat] Failed to update bot settings:", error)
      return NextResponse.json({ error: "Failed to update bot settings" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createBotSettingsHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
