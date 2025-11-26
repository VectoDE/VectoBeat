import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import { getBotStatus, getBotGuildPresence } from "@/lib/bot-status"

const normalizeDate = (value?: string | Date | null) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchSubscriptions?: typeof getUserSubscriptions
  fetchBotStatus?: typeof getBotStatus
}

export const createDashboardOverviewHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchSubscriptions = deps.fetchSubscriptions ?? getUserSubscriptions
  const fetchBotStatus = deps.fetchBotStatus ?? getBotStatus
  const fetchBotGuilds = getBotGuildPresence

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId query param required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const subscriptions = await fetchSubscriptions(discordId)
    const activeSubscriptions = subscriptions.filter((sub) => sub.status === "active")
    const totalMonthlyRevenue = activeSubscriptions.reduce((sum, sub) => sum + sub.pricePerMonth, 0)
    const nextRenewal = activeSubscriptions.reduce<string | null>((soonest, sub) => {
      const current = new Date(sub.currentPeriodEnd)
      if (Number.isNaN(current.getTime())) return soonest
      if (!soonest) return sub.currentPeriodEnd
      return new Date(soonest) > current ? sub.currentPeriodEnd : soonest
    }, null)

    const [botStatus, botGuildPresence] = await Promise.all([fetchBotStatus(), fetchBotGuilds()])
    const botGuildCount =
      typeof botStatus?.guildCount === "number"
        ? botStatus.guildCount
        : Array.isArray(botStatus?.guilds)
          ? botStatus.guilds.length
          : Array.isArray(botStatus?.servers)
            ? botStatus.servers.length
            : botGuildPresence.size > 0
              ? botGuildPresence.size
              : undefined

    const activePlayers =
      botStatus?.activePlayers ??
      botStatus?.players ??
      botStatus?.currentListeners ??
      (Array.isArray(botStatus?.players) ? botStatus.players.length : undefined)

    return NextResponse.json({
      subscriptions: {
        total: subscriptions.length,
        activeCount: activeSubscriptions.length,
        totalMonthly: totalMonthlyRevenue,
        nextRenewal: normalizeDate(nextRenewal),
      },
      bot: {
        guildCount: botGuildCount ?? null,
        activePlayers: typeof activePlayers === "number" ? activePlayers : null,
        uptime: botStatus?.uptime ?? botStatus?.uptimeSeconds ?? null,
        raw: botStatus ?? null,
      },
    })
  }

  return { GET: getHandler }
}

const defaultHandlers = createDashboardOverviewHandlers()
export const GET = defaultHandlers.GET
