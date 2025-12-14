import { format } from "date-fns"
import {
  getBlogPosts,
  type BlogPost,
  getSiteTrafficSummary,
  recordBotMetricSnapshot,
  getBotMetricHistory,
  type BotMetricHistoryEntry,
  BOT_SNAPSHOT_INTERVAL_MS,
  recordAnalyticsSnapshot,
  getForumStats,
  listForumEvents,
  type ForumStats,
  type ForumEventRecord,
  getBotUsageTotals,
} from "./db"
import { getBotStatus } from "./bot-status"

type BaseTotals = {
  totalViews: number
  totalPosts: number
  featuredPosts: number
  latestPublishedAt: string | null
  serverCount: number
  activeUsers: number
  totalStreams: number
  commandsTotal: number
  incidentsTotal: number
  uptimeSeconds: number
  uptimePercent: number
  responseTimeMs: number
}

type BaseMetrics = {
  posts: BlogPost[]
  totals: BaseTotals
  traffic: Awaited<ReturnType<typeof getSiteTrafficSummary>>
  activeVoiceConnections: Array<{ guildId: string; guildName?: string; channelId: string; channelName?: string; listeners: number }>
  forumStats: Awaited<ReturnType<typeof getForumStats>>
  forumEvents: Awaited<ReturnType<typeof listForumEvents>>
}

export type SummaryStat = {
  label: string
  value: string
  change?: string
  detail?: string
}

export type HomeMetrics = {
  stats: SummaryStat[]
  totals: {
    totalViews: number
    totalPosts: number
    featuredPosts: number
    latestPublishedAt: string | null
    serverCount: number
    activeUsers: number
    totalStreams: number
    commandsTotal: number
    uptimeValue: number
    uptimeLabel: string
    responseTimeMs: number
  }
  updatedAt: string
  activeVoiceConnections?: Array<{ guildId: string; guildName?: string; channelId: string; channelName?: string; listeners: number }>
}

type ChartPoint = Record<string, string | number>

export type AnalyticsOverview = {
  summaryCards: Array<{ label: string; value: string; change: string; detail: string }>
  userGrowthData: ChartPoint[]
  streamsData: ChartPoint[]
  sourceDistribution: Array<{ name: string; value: number; color: string }>
  geoDistribution: Array<{ name: string; value: number }>
  topPages: Array<{ path: string; views: number }>
  referrerHosts: Array<{ host: string; views: number }>
  referrerPaths: Array<{ host: string; path: string; views: number }>
  botSummary: Array<{ label: string; value: string; detail: string }>
  botHistory: Array<{ recordedAt: string; guildCount: number; activeListeners: number; totalStreams: number; avgResponseMs: number }>
  activeVoiceConnections: Array<{ guildId: string; channelId: string; listeners: number }>
  performanceMetrics: Array<{ metric: string; value: string; detail: string }>
  engagementMetrics: Array<{ metric: string; value: string; detail: string }>
  pageViews24h: number
  uniqueVisitors24h: number
  forumStats: ForumStats
  forumEvents: ForumEventRecord[]
  updatedAt: string
}

export type CombinedMetrics = {
  home: HomeMetrics
  analytics: AnalyticsOverview
}

const palette = ["#FF8C00", "#6B46C1", "#1DB954", "#FF4D6D", "#0EA5E9", "#F97316", "#22C55E", "#8B5CF6", "#F43F5E"]

const parseReferrerParts = (value?: string | null) => {
  if (!value) {
    return { host: "direct", path: "/" }
  }
  try {
    const parsed = new URL(value)
    const host = parsed.hostname || "direct"
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/"
    return { host, path }
  } catch {
    const sanitized = value.replace(/^[a-z]+:\/\//i, "")
    const [hostPart, ...rest] = sanitized.split("/")
    const host = hostPart || "direct"
    const path = rest.length ? `/${rest.join("/")}` : "/"
    return { host, path }
  }
}

const trimPath = (path: string) => {
  if (!path || path === "/") return path || "/"
  return path.length > 32 ? `${path.slice(0, 31)}…` : path
}

const shortNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.trunc(value).toLocaleString()
}

const normalizeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

const formatUptimeLabel = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%"
  }
  if (value <= 1) {
    return `${(value * 100).toFixed(2)}%`
  }
  if (value <= 100) {
    return `${value.toFixed(2)}%`
  }
  const seconds = Math.floor(value)
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) {
    return `${days}d ${hours}h`.trim()
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`.trim()
  }
  return `${Math.max(minutes, 1)}m`
}

const buildBaseMetrics = async (): Promise<BaseMetrics> => {
  const [postsResult, botStatusResult, trafficResult, forumStatsResult, forumEventsResult, usageTotalsResult] = await Promise.allSettled([
    getBlogPosts(),
    getBotStatus(),
    getSiteTrafficSummary(),
    getForumStats(),
    listForumEvents(100), // full span so Recent Forum Events always have data
    getBotUsageTotals(),
  ])
  const posts = postsResult.status === "fulfilled" ? postsResult.value : []
  const botStatus = botStatusResult.status === "fulfilled" ? botStatusResult.value : null
  const traffic =
    trafficResult.status === "fulfilled"
      ? trafficResult.value
      : {
          totalViews: 0,
          uniquePaths: 0,
          uniqueVisitors: 0,
          last24hViews: 0,
          last24hVisitors: 0,
          topPages: [],
          referrers: [],
          referrerHosts: [],
          referrerPaths: [],
          geo: [],
          dailySeries: [],
          monthlySeries: [],
        }
  const forumStats =
    forumStatsResult.status === "fulfilled"
      ? forumStatsResult.value
      : {
          categories: 0,
          threads: 0,
          posts: 0,
          events24h: 0,
          posts24h: 0,
          threads24h: 0,
          activePosters24h: 0,
          lastEventAt: null,
          topCategories: [],
        }
  const forumEvents = forumEventsResult.status === "fulfilled" ? forumEventsResult.value : []
  let fallbackSnapshot: BotMetricHistoryEntry | null = null
  if (!botStatus) {
    const history = await getBotMetricHistory(1)
    fallbackSnapshot = history.at(-1) ?? null
  }
  const usageTotals =
    usageTotalsResult.status === "fulfilled"
      ? usageTotalsResult.value
      : { totalStreams: 0, commandsTotal: 0, incidentsTotal: 0, updatedAt: null }
  const totalViews = posts.reduce((sum, post) => sum + (post.views ?? 0), 0)
  const featuredPosts = posts.filter((post) => post.featured).length
  const totalPosts = posts.length
  const latestPublishedAt =
    posts.length > 0 ? posts.reduce((latest, post) => (post.publishedAt > latest ? post.publishedAt : latest), posts[0].publishedAt) : null

  const resolveArrayCount = (payload: { guilds?: unknown[]; servers?: unknown[] }) => {
    if (Array.isArray(payload.guilds)) return payload.guilds.length
    if (Array.isArray(payload.servers)) return payload.servers.length
    return undefined
  }

  const serverCount = normalizeNumber(
    typeof botStatus?.guildCount === "number"
      ? botStatus.guildCount
      : resolveArrayCount((botStatus as { guilds?: unknown[]; servers?: unknown[] }) ?? {}) ??
          fallbackSnapshot?.guildCount ??
          0,
  )
  const playersDetail =
    botStatus && Array.isArray((botStatus as { playersDetail?: Array<{ isPlaying?: boolean }> }).playersDetail)
      ? ((botStatus as { playersDetail?: Array<{ isPlaying?: boolean }> }).playersDetail ?? [])
      : []
  const listenerDetail =
    botStatus &&
    Array.isArray(
      (
        botStatus as {
          listenerDetail?: Array<{ guildId: string; channelId: string; listeners: number; guildName?: string; channelName?: string }>
        }
      ).listenerDetail,
    )
      ? (
          botStatus as {
            listenerDetail?: Array<{ guildId: string; channelId: string; listeners: number; guildName?: string; channelName?: string }>
          }
        ).listenerDetail!.map((entry) => ({
          guildId: typeof entry.guildId === "string" ? entry.guildId : "",
          guildName: typeof entry.guildName === "string" ? entry.guildName : undefined,
          channelId: typeof entry.channelId === "string" ? entry.channelId : "",
          channelName: typeof entry.channelName === "string" ? entry.channelName : undefined,
          listeners: normalizeNumber(entry.listeners),
        }))
      : []
  const rawCurrentListeners = normalizeNumber(
    botStatus?.activePlayers ??
      botStatus?.players ??
      botStatus?.currentListeners ??
      botStatus?.listeners ??
      (playersDetail.length ? playersDetail.filter((player) => player?.isPlaying).length : undefined) ??
      fallbackSnapshot?.activeListeners,
  )
  const activeUsers = normalizeNumber(botStatus?.listenerPeak24h ?? botStatus?.listeners24h ?? rawCurrentListeners)
  const totalStreams =
    typeof usageTotals.totalStreams === "number"
      ? usageTotals.totalStreams
      : normalizeNumber(
          botStatus?.totalStreams ?? botStatus?.streams ?? botStatus?.streamCount ?? fallbackSnapshot?.totalStreams,
        )
  const commandsTotal = normalizeNumber(usageTotals.commandsTotal ?? 0)
  const incidentsTotal = normalizeNumber(usageTotals.incidentsTotal ?? 0)
  const uptimeSeconds = normalizeNumber(botStatus?.uptimeSeconds ?? botStatus?.uptime ?? fallbackSnapshot?.uptimePercent)
  const uptimePercentTelemetry = normalizeNumber(
    botStatus?.uptimePercent ?? botStatus?.uptimePercentage ?? botStatus?.uptime_percent,
  )
  const uptimePercentBase =
    uptimePercentTelemetry ||
    (uptimeSeconds > 0 ? Math.min(100, Math.max((uptimeSeconds / 86_400) * 100, 0)) : 0)
  const responseTimeMs = normalizeNumber(
    botStatus?.latency ??
      botStatus?.averageLatency ??
      (botStatus as { latencyMs?: number })?.latencyMs ??
      fallbackSnapshot?.avgResponseMs,
  )

  if (botStatus) {
    const snapshotPayload = {
      guildCount: serverCount,
      activeListeners: rawCurrentListeners,
      totalStreams,
      uptimePercent: uptimePercentBase,
      avgResponseMs: Math.round(responseTimeMs),
      voiceConnections: normalizeNumber(
        (botStatus as { voiceConnections?: number; activeVoice?: number; connectedVoiceChannels?: number }).voiceConnections ??
          (botStatus as { activeVoice?: number }).activeVoice ??
          (botStatus as { connectedVoiceChannels?: number }).connectedVoiceChannels ??
          0,
      ),
      incidents24h: normalizeNumber((botStatus as { incidents24h?: number; incidents?: number }).incidents24h ?? (botStatus as { incidents?: number }).incidents ?? 0),
      commands24h: normalizeNumber((botStatus as { commands24h?: number; commands?: number }).commands24h ?? (botStatus as { commands?: number }).commands ?? 0),
      shardsOnline: normalizeNumber(
        (botStatus as { shardsOnline?: number }).shardsOnline ??
          (Array.isArray((botStatus as { shards?: Array<{ online?: boolean }> }).shards)
            ? (botStatus as { shards?: Array<{ online?: boolean }> }).shards!.filter((shard) => shard && shard.online !== false).length
            : 0),
      ),
      shardsTotal: normalizeNumber(
        (botStatus as { shardsTotal?: number }).shardsTotal ??
          (Array.isArray((botStatus as { shards?: Array<unknown> }).shards)
            ? (botStatus as { shards?: Array<unknown> }).shards!.length
            : (botStatus as { shardCount?: number }).shardCount ?? 0),
      ),
    }
    void recordBotMetricSnapshot(snapshotPayload)
  }

  return {
    posts,
    totals: {
      totalViews,
      totalPosts,
      featuredPosts,
      latestPublishedAt,
      serverCount,
      activeUsers,
      totalStreams,
      commandsTotal,
      incidentsTotal,
      uptimeSeconds,
      uptimePercent: uptimePercentBase,
      responseTimeMs,
    },
    traffic,
    activeVoiceConnections: listenerDetail,
    forumStats,
    forumEvents,
  }
}

const getMonthBuckets = (posts: BlogPost[]) => {
  const buckets = new Map<
    string,
    {
      label: string
      timestamp: number
      views: number
      posts: number
      featured: number
    }
  >()

  posts.forEach((post) => {
    const date = new Date(post.publishedAt)
    if (Number.isNaN(date.getTime())) {
      return
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    if (!buckets.has(key)) {
      buckets.set(key, {
        label: format(date, "MMM yyyy"),
        timestamp: date.getTime(),
        views: 0,
        posts: 0,
        featured: 0,
      })
    }
    const bucket = buckets.get(key)!
    bucket.views += post.views ?? 0
    bucket.posts += 1
    if (post.featured) {
      bucket.featured += 1
    }
  })

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp)
}

const computeUptimeAvailability = (history: BotMetricHistoryEntry[]): number => {
  if (!history.length) {
    return 0
  }
  const latestPercent = normalizeNumber(history[history.length - 1]?.uptimePercent)
  if (latestPercent > 0) {
    return Math.min(100, latestPercent)
  }

  const points = history
    .map((entry) => ({
      ts: new Date(entry.recordedAt).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts)

  if (!points.length) {
    return 0
  }

  const now = Date.now()
  const start = points[0]!.ts
  const totalMs = Math.max(now - start, 1)
  let uptimeMs = 0
  for (let i = 1; i < points.length; i += 1) {
    const gap = Math.max(points[i]!.ts - points[i - 1]!.ts, 0)
    uptimeMs += gap
  }
  uptimeMs += Math.max(now - points[points.length - 1]!.ts, 0)

  const percent = (uptimeMs / totalMs) * 100
  return Math.min(100, Math.max(percent, 0))
}

const buildHomeStats = (base: BaseMetrics, history: BotMetricHistoryEntry[] = []): HomeMetrics => {
  const { totals, traffic } = base
  const uptimePercent = history.length ? computeUptimeAvailability(history) : totals.uptimePercent || (totals.uptimeSeconds > 0 ? 100 : 0)
  const uptimeLabel = `${uptimePercent.toFixed(2)}%`
  const avgResponseLabel = `${totals.responseTimeMs ? Math.round(totals.responseTimeMs) : 0}ms`
  const blogBuckets = getMonthBuckets(base.posts)
  const latestBlogBucket = blogBuckets.at(-1)

  const stats: SummaryStat[] = [
    {
      label: "Blog Posts",
      value: totals.totalPosts.toString(),
      change: `${totals.featuredPosts} featured · ${latestBlogBucket?.posts ?? 0} last month`,
    },
    {
      label: "Blog Views",
      value: shortNumber(totals.totalViews),
      change: totals.totalPosts
        ? `${shortNumber(Math.max(Math.round(totals.totalViews / Math.max(totals.totalPosts, 1)), 1))} avg/post`
        : "No articles yet",
    },
    {
      label: "Site Views (30d)",
      value: shortNumber(traffic.totalViews),
      change: `${shortNumber(traffic.last24hViews)} last 24h`,
    },
    {
      label: "Active Servers",
      value: shortNumber(totals.serverCount),
      change: totals.serverCount ? "Bot telemetry" : "No telemetry",
    },
    {
      label: "Active Users",
      value: shortNumber(totals.activeUsers),
      change: totals.activeUsers ? "Bot telemetry" : "No telemetry",
    },
    {
      label: "Commands Executed",
      value: shortNumber(totals.commandsTotal),
      change: totals.commandsTotal ? "Lifetime slash/button events" : "No telemetry",
    },
    {
      label: "Streams Processed",
      value: shortNumber(totals.totalStreams),
      change: totals.totalStreams ? "Playback telemetry" : "No telemetry",
    },
    {
      label: "Uptime",
      value: uptimeLabel,
      change: totals.responseTimeMs ? `Latency ${avgResponseLabel}` : "No telemetry",
    },
  ]

  return {
    stats,
    totals: {
      totalViews: totals.totalViews,
      totalPosts: totals.totalPosts,
      featuredPosts: totals.featuredPosts,
      latestPublishedAt: totals.latestPublishedAt,
      serverCount: totals.serverCount,
      activeUsers: totals.activeUsers,
      totalStreams: totals.totalStreams,
      commandsTotal: totals.commandsTotal,
      uptimeValue: uptimePercent,
      uptimeLabel,
      responseTimeMs: totals.responseTimeMs,
    },
    updatedAt: new Date().toISOString(),
  }
}

const generateAnalytics = (base: BaseMetrics, botHistory: BotMetricHistoryEntry[]): AnalyticsOverview => {
  const { totals, traffic } = base
  const userGrowthData = traffic.monthlySeries.map((bucket) => ({
    label: format(new Date(bucket.date), "MMM yyyy"),
    views: bucket.views,
    visitors: bucket.visitors ?? 0,
  }))

  const streamsData = traffic.dailySeries.map((bucket) => ({
    label: format(new Date(bucket.date), "MMM dd"),
    views: bucket.views,
    visitors: bucket.visitors ?? 0,
  }))

  const sourceDistribution = traffic.topPages.map((entry, index) => ({
    name: entry.path || "/",
    value: entry.views,
    color: palette[index % palette.length],
  }))

  const hostCount = new Map<string, number>()
  const pathCount = new Map<string, { host: string; path: string; views: number }>()

  const aggregateReferrers = () => {
    traffic.referrers.forEach((entry) => {
      const { host, path } = parseReferrerParts(entry.referrer)
      if (host) {
        hostCount.set(host, (hostCount.get(host) ?? 0) + entry.views)
      }
      if (host && path && path !== "/") {
        const key = `${host}::${path}`
        const existing = pathCount.get(key)
        if (existing) {
          existing.views += entry.views
        } else {
          pathCount.set(key, { host, path, views: entry.views })
        }
      }
    })

    return {
      hosts: Array.from(hostCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([host, views]) => ({ host, views })),
      paths: Array.from(pathCount.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, 12),
    }
  }

  const hasDbHosts = Array.isArray(traffic.referrerHosts) && traffic.referrerHosts.length > 0
  const hasDbPaths = Array.isArray(traffic.referrerPaths) && traffic.referrerPaths.length > 0

  const aggregated = !hasDbHosts || !hasDbPaths ? aggregateReferrers() : null

  const referrerHosts: Array<{ host: string; views: number }> = hasDbHosts
    ? (traffic as { referrerHosts: Array<{ host: string; views: number }> }).referrerHosts.map((entry) => ({
        host: entry.host || "direct",
        views: entry.views,
      }))
    : aggregated?.hosts ?? []

  const referrerPaths = hasDbPaths
    ? (traffic as { referrerPaths: Array<{ host: string; path: string; views: number }> }).referrerPaths.map((entry) => ({
        host: entry.host || "direct",
        path: entry.path || "/",
        views: entry.views,
      }))
    : aggregated?.paths ?? []

  const forumStats = base.forumStats
  const forumEvents = base.forumEvents

  const summaryCards: AnalyticsOverview["summaryCards"] = [
    {
      label: "Site Views (30d)",
      value: shortNumber(traffic.totalViews),
      change: `${shortNumber(traffic.last24hViews)} last 24h`,
      detail: `${shortNumber(traffic.uniquePaths)} unique routes`,
    },
    {
      label: "Unique Visitors (30d)",
      value: shortNumber(traffic.uniqueVisitors),
      change: `${shortNumber(traffic.last24hVisitors)} last 24h`,
      detail: "Hashed IP totals",
    },
    {
      label: "Blog Articles",
      value: totals.totalPosts.toString(),
      change: `${totals.featuredPosts} featured`,
      detail: "Published guides & updates",
    },
    {
      label: "Blog Views",
      value: shortNumber(totals.totalViews),
      change: totals.latestPublishedAt ? `Updated ${format(new Date(totals.latestPublishedAt), "MMM dd")}` : "Awaiting publish",
      detail: "All-time reads",
    },
    {
      label: "Active Servers",
      value: shortNumber(totals.serverCount),
      change: totals.activeUsers ? `${shortNumber(totals.activeUsers)} listeners` : "Bot telemetry pending",
      detail: "Reported guilds",
    },
    {
      label: "Commands Processed",
      value: shortNumber(totals.commandsTotal),
      change: totals.commandsTotal ? "Lifetime slash/button events" : "No telemetry yet",
      detail: totals.commandsTotal ? "DB-backed counter" : "Usage API pending",
    },
    {
      label: "Streams Processed",
      value: shortNumber(totals.totalStreams),
      change: totals.totalStreams ? "Live bot telemetry" : "No data yet",
      detail: "Playback events",
    },
    {
      label: "Forum Threads",
      value: shortNumber(forumStats.threads),
      change: `${shortNumber(forumStats.posts24h)} posts last 24h`,
      detail: `${forumStats.categories} categories · ${forumStats.events24h} events`,
    },
  ]

  const uptimePercentAnalytics = botHistory.length
    ? computeUptimeAvailability(botHistory)
    : totals.uptimePercent || (totals.uptimeSeconds > 0 ? 100 : 0)

  const performanceMetrics = [
    {
      metric: "Page Views (24h)",
      value: shortNumber(traffic.last24hViews),
      detail: "Recorded via SiteAnalytics tracker",
    },
    {
      metric: "Visitors (24h)",
      value: shortNumber(traffic.last24hVisitors),
      detail: "Distinct hashed IPs",
    },
    {
      metric: "Tracked Routes",
      value: shortNumber(traffic.uniquePaths),
      detail: "Unique paths seen in the last 30 days",
    },
    {
      metric: "Top Route",
      value: traffic.topPages?.[0]?.path ?? "/",
      detail: "Most visited path (lifetime)",
    },
    {
      metric: "Bot Uptime",
      value: `${uptimePercentAnalytics.toFixed(2)}%`,
      detail: uptimePercentAnalytics ? "Live bot telemetry" : "No telemetry yet",
    },
    {
      metric: "Forum Events (24h)",
      value: shortNumber(forumStats.events24h),
      detail: `${forumStats.threads24h} threads · ${forumStats.posts24h} posts`,
    },
  ]

  const avgViewsPerPost = totals.totalPosts ? totals.totalViews / Math.max(totals.totalPosts, 1) : 0
  const latestDaily = streamsData.at(-1)
  const latestMonthly = userGrowthData.at(-1)
  const latestBotSnapshot = botHistory.at(-1)
  const avgStreamsPerGuild =
    latestBotSnapshot && latestBotSnapshot.guildCount
      ? (latestBotSnapshot.totalStreams / Math.max(latestBotSnapshot.guildCount, 1)).toFixed(1)
      : totals.totalStreams && totals.serverCount
        ? (totals.totalStreams / Math.max(totals.serverCount, 1)).toFixed(1)
        : "0"
  const engagementMetrics = [
    {
      metric: "Avg Blog Views/Post",
      value: avgViewsPerPost ? avgViewsPerPost.toFixed(1) : "0",
      detail: "All-time article reach",
    },
    {
      metric: "Daily Page Views",
      value: latestDaily ? shortNumber(Number(latestDaily.views)) : "0",
      detail: latestDaily ? latestDaily.label : "No data recorded",
    },
    {
      metric: "Monthly Visitors",
      value: latestMonthly ? shortNumber(Number(latestMonthly.visitors)) : "0",
      detail: latestMonthly ? latestMonthly.label : "No data recorded",
    },
    {
      metric: "Streams / Guild",
      value: avgStreamsPerGuild,
      detail: latestBotSnapshot ? "Last snapshot" : "Average lifetime",
    },
    {
      metric: "Avg Response",
      value: totals.responseTimeMs ? `${Math.round(totals.responseTimeMs)}ms` : "n/a",
      detail: totals.responseTimeMs ? "Bot latency" : "No telemetry yet",
    },
    {
      metric: "Active Posters (24h)",
      value: shortNumber(forumStats.activePosters24h),
      detail: forumStats.lastEventAt ? `Last event ${new Date(forumStats.lastEventAt).toLocaleString()}` : "No activity",
    },
  ]

  const botSummary = [
    {
      label: "Guilds Online",
      value: shortNumber(latestBotSnapshot?.guildCount ?? totals.serverCount),
      detail: "Reported via bot telemetry",
    },
    {
      label: "Active Listeners",
      value: shortNumber(latestBotSnapshot?.activeListeners ?? totals.activeUsers),
      detail: "Across all shards",
    },
    {
      label: "Voice Connections",
      value: shortNumber(latestBotSnapshot?.voiceConnections ?? 0),
      detail: "Live channel links",
    },
    {
      label: "Commands (24h)",
      value: shortNumber(latestBotSnapshot?.commands24h ?? 0),
      detail: "Slash + button executions",
    },
    {
      label: "Incidents (24h)",
      value: shortNumber(latestBotSnapshot?.incidents24h ?? 0),
      detail: "Auto-escalated events",
    },
    {
      label: "Avg Response",
      value:
        typeof latestBotSnapshot?.avgResponseMs === "number" && Number.isFinite(latestBotSnapshot.avgResponseMs)
          ? `${latestBotSnapshot.avgResponseMs}ms`
          : totals.responseTimeMs
            ? `${Math.round(totals.responseTimeMs)}ms`
            : "n/a",
      detail: "Shard latency",
    },
  ]

  const botHistorySeries = botHistory.map((entry) => ({
    recordedAt: entry.recordedAt,
    guildCount: entry.guildCount,
    activeListeners: entry.activeListeners,
    totalStreams: entry.totalStreams,
    avgResponseMs: entry.avgResponseMs,
  }))

  return {
    summaryCards,
    userGrowthData,
    streamsData,
    sourceDistribution,
    referrerHosts,
    referrerPaths,
    performanceMetrics,
    geoDistribution: traffic.geo.map((entry) => ({ name: entry.country, value: entry.views })),
    topPages: traffic.topPages,
    pageViews24h: traffic.last24hViews,
    uniqueVisitors24h: traffic.last24hVisitors,
    engagementMetrics,
    botSummary,
    botHistory: botHistorySeries,
    activeVoiceConnections: base.activeVoiceConnections,
    forumStats,
    forumEvents,
    updatedAt: new Date().toISOString(),
  }
}

export const getHomeMetrics = async (): Promise<HomeMetrics> => {
  const [base, botHistory] = await Promise.all([buildBaseMetrics(), getBotMetricHistory(60)])
  const snapshot = buildHomeStats(base, botHistory)
  void recordAnalyticsSnapshot(snapshot)
  return snapshot
}

export const getAnalyticsOverview = async (): Promise<AnalyticsOverview> => {
  const [base, botHistory] = await Promise.all([buildBaseMetrics(), getBotMetricHistory(60)])
  const snapshot = generateAnalytics(base, botHistory)
  void recordAnalyticsSnapshot(snapshot)
  return snapshot
}

export const getAllMetrics = async (): Promise<CombinedMetrics> => {
  const [base, botHistory] = await Promise.all([buildBaseMetrics(), getBotMetricHistory(60)])
  const home = buildHomeStats(base, botHistory)
  const analytics = generateAnalytics(base, botHistory)
  void recordAnalyticsSnapshot(home)
  void recordAnalyticsSnapshot(analytics)
  return { home, analytics }
}
