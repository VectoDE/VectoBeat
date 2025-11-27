import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getBotSettings, updateBotSettings } from "@/lib/db"
import { emitBotDefaultsUpdate } from "@/lib/server-settings-sync"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import { clamp } from "@/lib/math"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchBotSettings?: typeof getBotSettings
  saveBotSettings?: typeof updateBotSettings
}

const INTERNAL_SECRETS = expandSecrets(
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.STATUS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
)

export const createBotSettingsHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchBotSettings = deps.fetchBotSettings ?? getBotSettings
  const saveBotSettings = deps.saveBotSettings ?? updateBotSettings

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const isInternal = authorizeRequest(request, INTERNAL_SECRETS, { allowLocalhost: true })
    if (!isInternal) {
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
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

      const isInternal = authorizeRequest(request, INTERNAL_SECRETS, { allowLocalhost: true })
      if (!isInternal) {
        const auth = await verifyUser(request, discordId)
        if (!auth.valid) {
          return NextResponse.json({ error: "unauthorized" }, { status: 401 })
        }
      }

      const normalizedUpdates = {
        ...updates,
        ...(typeof updates.defaultVolume === "number"
          ? { defaultVolume: clamp(Math.round(updates.defaultVolume), 0, 200) }
          : {}),
      }

      const settings = await saveBotSettings(discordId, normalizedUpdates)
      void emitBotDefaultsUpdate(discordId, settings as unknown as Record<string, unknown>)
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
