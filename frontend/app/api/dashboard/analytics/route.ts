import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import { getQueueSnapshot } from "@/lib/queue-sync-store"
import type { MembershipTier } from "@/lib/memberships"
import type { AnalyticsOverview } from "@/lib/metrics"
import type { QueueSnapshot } from "@/types/queue-sync"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { getApiKeySecrets } from "@/lib/api-keys"

const AUTH_TOKEN_TYPES = ["control_panel", "server_settings", "status_api", "status_events", "analytics"]

const isAuthorizedByToken = async (request: NextRequest) => {
  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  return authorizeRequest(request, secrets, {
    allowLocalhost: true,
    headerKeys: ["authorization", "x-api-key", "x-server-settings-key", "x-status-key", "x-analytics-key"],
  })
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
    const tokenAuthorized = await isAuthorizedByToken(request)
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
    activeVoiceConnections: [],
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
    forumStats: {
      categories: 0,
      threads: 0,
      posts: 0,
      events24h: 0,
      posts24h: 0,
      threads24h: 0,
      activePosters24h: 0,
      lastEventAt: null,
      topCategories: [],
    },
    forumEvents: [],
    updatedAt,
  }
}
