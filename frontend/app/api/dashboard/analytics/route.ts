import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import { getQueueSnapshot } from "@/lib/queue-sync-store"
import type { MembershipTier } from "@/lib/memberships"
import type { AnalyticsOverview } from "@/lib/metrics"
import type { QueueSnapshot } from "@/types/queue-sync"
import { getPlanCapabilities } from "@/lib/plan-capabilities"

const AUTH_TOKENS = [
  process.env.CONTROL_PANEL_API_KEY,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.STATUS_API_KEY,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.BOT_STATUS_API_KEY,
].filter((value): value is string => Boolean(value && value.trim()))

const isLocalRequest = (request: NextRequest) => {
  const host = (request.headers.get("host") || "").toLowerCase()
  if (host.includes("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") || host.startsWith("::1")) {
    return true
  }
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const forwardedIp = forwarded.split(",")[0]?.trim()
  return forwardedIp === "127.0.0.1" || forwardedIp === "::1"
}

const resolveToken = (request: NextRequest) => {
  const bearer = request.headers.get("authorization") || ""
  if (bearer) {
    const token = bearer.replace(/^Bearer\\s+/i, "").trim()
    if (token) return token
  }
  const headerToken =
    request.headers.get("x-api-key") ||
    request.headers.get("x-server-settings-key") ||
    request.headers.get("x-status-key") ||
    request.headers.get("x-analytics-key")
  if (headerToken && headerToken.trim()) {
    return headerToken.trim()
  }
  const queryToken = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("key")
  return queryToken?.trim() || null
}

const isAuthorizedByToken = (request: NextRequest) => {
  if (!AUTH_TOKENS.length) return false
  if (isLocalRequest(request)) return true
  const token = resolveToken(request)
  if (!token) return false
  return AUTH_TOKENS.includes(token)
}

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchSubscriptions?: typeof getUserSubscriptions
  fetchQueueSnapshot?: typeof getQueueSnapshot
}

export const createAnalyticsHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchSubscriptions = deps.fetchSubscriptions ?? getUserSubscriptions
  const fetchQueueSnapshot = deps.fetchQueueSnapshot ?? getQueueSnapshot

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    const guildId = request.nextUrl.searchParams.get("guildId")
    const tokenAuthorized = isAuthorizedByToken(request)
    if (!guildId || (!discordId && !tokenAuthorized)) {
      return NextResponse.json({ error: "discordId and guildId required" }, { status: 400 })
    }

    if (!tokenAuthorized) {
      const verification = await verifyUser(request, discordId!)
      if (!verification.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      const subscriptions = await fetchSubscriptions(discordId!)
      const guildSubscription = subscriptions.find(
        (sub) => sub.discordServerId === guildId && sub.status === "active",
      )
      if (!guildSubscription) {
        return NextResponse.json({ error: "guild_not_found" }, { status: 404 })
      }
      const plan = getPlanCapabilities(guildSubscription.tier as MembershipTier)
      if (plan.serverSettings.maxAnalyticsMode === "basic") {
        return NextResponse.json({ error: "starter_required" }, { status: 403 })
      }
    }

    const snapshot = await fetchQueueSnapshot(guildId)
    const analytics = buildGuildAnalytics(guildId, snapshot)
    return NextResponse.json({ analytics })
  }

  return { GET: getHandler }
}

const defaultHandlers = createAnalyticsHandlers()
export const GET = defaultHandlers.GET

const buildGuildAnalytics = (guildId: string, snapshot: QueueSnapshot | null): AnalyticsOverview & {
  __guildId: string
} => {
  const queueLength = snapshot?.queue?.length ?? 0
  const nowPlaying = snapshot?.nowPlaying
  const updatedAt = snapshot?.updatedAt ?? new Date().toISOString()
  const sourceCounts = new Map<string, number>()
  snapshot?.queue?.forEach((track) => {
    const key = (track.source || "unknown").toLowerCase()
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1)
  })
  const summaryCards = [
    {
      label: "Current Queue",
      value: `${queueLength} track${queueLength === 1 ? "" : "s"}`,
      change: "",
      detail: snapshot ? `Last update ${new Date(updatedAt).toLocaleTimeString()}` : "No recent data",
    },
    {
      label: "Now Playing",
      value: nowPlaying ? nowPlaying.title : "Idle",
      change: "",
      detail: nowPlaying ? nowPlaying.author : "Queue awaiting tracks",
    },
  ]

  return {
    __guildId: guildId,
    summaryCards,
    userGrowthData: [],
    streamsData: [
      { label: "Queue", value: queueLength },
      { label: "Now Playing", value: nowPlaying ? 1 : 0 },
    ],
    sourceDistribution: Array.from(sourceCounts.entries()).map(([key, value], index) => ({
      name: key.toUpperCase(),
      value,
      color: ["#FF4D6D", "#1DB954", "#0EA5E9", "#F97316", "#6B46C1"][index % 5],
    })),
    geoDistribution: [],
    topPages: [],
    referrerHosts: [],
    referrerPaths: [],
    botSummary: [
      { label: "Guild ID", value: guildId, detail: "" },
      { label: "Queue Updated", value: new Date(updatedAt).toLocaleString(), detail: "" },
    ],
    botHistory: [
      {
        recordedAt: updatedAt,
        guildCount: 1,
        activeListeners: nowPlaying ? 1 : 0,
        totalStreams: queueLength,
        avgResponseMs: 0,
      },
    ],
    performanceMetrics: [
      { metric: "Queue Length", value: `${queueLength}`, detail: "Tracks awaiting playback" },
      {
        metric: "Now Playing",
        value: nowPlaying ? nowPlaying.title : "Idle",
        detail: nowPlaying ? nowPlaying.author : "No active track",
      },
    ],
    engagementMetrics: [
      { metric: "Queue Updates", value: snapshot ? "Live" : "Waiting", detail: "Based on bot telemetry" },
    ],
    pageViews24h: queueLength,
    uniqueVisitors24h: queueLength,
    updatedAt,
  }
}
