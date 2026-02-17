"use client"

import { useEffect, useState } from "react"
import { io, type Socket } from "socket.io-client"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalyticsOverview, CombinedMetrics } from "@/lib/metrics"
import { apiClient } from "@/lib/api-client"

interface StatsControlPanelProps {
  initialData: AnalyticsOverview
}

const formatNumber = (value: number | undefined) => {
  if (!Number.isFinite(value)) return "0"
  if (!value) return "0"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

const tooltipStyles = {
  backgroundColor: "#05060b",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: "0.75rem",
  color: "#f8fafc",
}

const tooltipLabelStyle = { color: "#f8fafc" }
const tooltipItemStyle = { color: "#f8fafc" }
const CARD_HOVER =
  "hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-1 hover:scale-[1.01]"
const PANEL_BG = "bg-linear-to-br from-primary/10 via-background to-background"

export function StatsControlPanel({ initialData }: StatsControlPanelProps) {
  const [data, setData] = useState(initialData)
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "error">("connecting")
  const [lastUpdated, setLastUpdated] = useState(() => new Date(initialData.updatedAt).toLocaleString())

  useEffect(() => {
    let mounted = true
    let socket: Socket | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const fetchLatest = async () => {
      try {
        const payload = await apiClient<AnalyticsOverview>("/api/metrics?scope=analytics", { cache: "no-store" })
        if (mounted && payload) {
          setData(payload)
          setLastUpdated(new Date(payload.updatedAt).toLocaleString())
        }
      } catch (error) {
        console.error("[VectoBeat] Analytics polling failed:", error)
      }
    }

    const startPolling = () => {
      if (pollTimer) return
      void fetchLatest()
      pollTimer = setInterval(fetchLatest, 30_000)
    }

    const stopPolling = () => {
      if (!pollTimer) return
      clearInterval(pollTimer)
      pollTimer = null
    }

    const connect = async () => {
      try {
        await apiClient<any>("/api/socket")
        socket = io({ path: "/api/socket" })

        socket.on("connect", () => {
          if (!mounted) return
          setConnectionState("connected")
          stopPolling()
        })

        socket.on("connect_error", (error) => {
          console.error("[VectoBeat] Socket connection failed:", error)
          if (!mounted) return
          setConnectionState("error")
          startPolling()
        })

        socket.on("stats:update", (payload: CombinedMetrics) => {
          if (mounted && payload?.analytics) {
            setData(payload.analytics)
            setLastUpdated(new Date(payload.analytics.updatedAt).toLocaleString())
          }
        })

        socket.on("disconnect", () => {
          if (!mounted) return
          setConnectionState("error")
          startPolling()
        })
      } catch (error) {
        console.error("[VectoBeat] Failed to establish socket connection:", error)
        if (mounted) {
          setConnectionState("error")
          startPolling()
        }
      }
    }

    void connect()

    return () => {
      mounted = false
      if (socket) {
        socket.disconnect()
      }
      if (pollTimer) {
        clearInterval(pollTimer)
      }
    }
  }, [])

  const topRoutes = data.topPages.slice(0, 5)
  const geoSample = data.geoDistribution.slice(0, 10)
  const referrerHosts: { host: string; views: number }[] = Array.isArray(data.referrerHosts)
    ? data.referrerHosts.slice(0, 6)
    : []
  const referrerPaths: { host: string; path: string; views: number }[] = Array.isArray(data.referrerPaths)
    ? data.referrerPaths.slice(0, 8)
    : []
  const botSummary = data.botSummary ?? []
  const botHistory = data.botHistory ?? []
  const forumStats = data.forumStats ?? {
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
  const forumEvents = data.forumEvents ?? []
  const botHistoryChart = botHistory.map((entry) => ({
    label: new Date(entry.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    guilds: entry.guildCount,
    listeners: entry.activeListeners,
    response: entry.avgResponseMs,
  }))
  const referrerPathChart = referrerPaths.map((entry) => ({
    host: entry.host || "direct",
    path: entry.path || "/",
    views: entry.views,
  }))
  const activeVoiceConnections = Array.isArray(data.activeVoiceConnections) ? data.activeVoiceConnections : []
  const summaryCards = [
    ...data.summaryCards,
    {
      label: "Voice Connections",
      value: formatNumber(activeVoiceConnections.length),
      change: activeVoiceConnections.length ? "Live listeners by channel" : "No active voice channels",
      detail: undefined,
    },
  ]
  return (
    <>
      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden" data-animate-on-scroll="off">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40 animate-pulse" />
          <div
            className="absolute -bottom-20 left-1/3 w-80 h-80 bg-secondary/20 rounded-full blur-3xl opacity-30 animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 animate-fade-in-up">Statistics & Analytics</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto animate-fade-in-up animation-delay-200">
            Live data that captures VectoBeat&apos;s reach, reliability, and user engagement across every touchpoint.
          </p>
          <p className="text-sm text-foreground/50 mt-6 animate-fade-in-up animation-delay-400">
            Last updated {lastUpdated} · Status{" "}
            <span className={connectionState === "connected" ? "text-primary" : "text-red-400"}>
              {connectionState === "connected"
                ? "Streaming live metrics"
                : connectionState === "connecting"
                  ? "Connecting..."
                  : "Offline"}
            </span>
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {summaryCards.map((stat, i) => (
              <div
                key={`${stat.label}-${i}`}
                className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 hover:scale-105 animate-slide-up-fade group animate-smooth-glow`}
                style={{ animationDelay: `${i * 75}ms` }}
              >
                <p className="text-foreground/60 text-sm font-medium mb-2">{stat.label}</p>
                <div className="flex items-end justify-between mb-2">
                  <div className="text-3xl md:text-4xl font-bold animate-pulse-scale group-hover:animate-elastic-bounce">{stat.value}</div>
                  {stat.change ? <span className="text-sm font-semibold text-primary/80">{stat.change}</span> : null}
                </div>
                {stat.detail ? <p className="text-foreground/50 text-xs">{stat.detail}</p> : null}
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: "Forum Threads", value: forumStats.threads, detail: `${forumStats.threads24h} in 24h` },
              { label: "Forum Posts", value: forumStats.posts, detail: `${forumStats.posts24h} in 24h` },
              { label: "Events (24h)", value: forumStats.events24h, detail: `${forumStats.activePosters24h} active posters` },
              { label: "Categories", value: forumStats.categories, detail: "Top categories below" },
            ].map((card) => (
              <div key={card.label} className={`p-5 rounded-lg border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
                <p className="text-sm text-foreground/60">{card.label}</p>
                <p className="text-3xl font-bold mt-2">{formatNumber(card.value)}</p>
                <p className="text-xs text-foreground/50 mt-1">{card.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className={`p-5 rounded-lg border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-foreground">Top Categories</h3>
                <span className="text-xs text-foreground/50">Forum telemetry</span>
              </div>
              <div className="space-y-3">
                {forumStats.topCategories.slice(0, 5).map((cat) => (
                  <div key={cat.slug} className="flex items-center gap-3">
                    <div className="w-full">
                      <div className="flex items-center justify-between text-sm text-foreground/70">
                        <span className="font-semibold text-foreground">{cat.title}</span>
                        <span className="text-xs text-foreground/60">{cat.threads} threads</span>
                      </div>
                      <div className="w-full h-2 bg-border rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-2 bg-primary rounded-full"
                          style={{
                            width: `${Math.min(100, (cat.threads / Math.max(forumStats.threads || 1, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {forumStats.topCategories.length === 0 ? (
                  <p className="text-sm text-foreground/60">No forum activity recorded yet.</p>
                ) : null}
              </div>
            </div>

            <div className={`p-5 rounded-lg border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-foreground">Recent Forum Events</h3>
                <span className="text-xs text-foreground/50">
                  {forumStats.lastEventAt ? `Last: ${new Date(forumStats.lastEventAt).toLocaleString()}` : "No events"}
                </span>
              </div>
              <div className="space-y-2">
                {forumEvents.slice(0, 8).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {event.action.replace(/_/g, " ")} · {event.entityType}
                      </p>
                      <p className="text-xs text-foreground/60">
                        {event.actorName || "Unknown"} · {event.categorySlug || "forum"}
                      </p>
                    </div>
                    <span className="text-xs text-foreground/50">
                      {new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                {forumEvents.length === 0 ? (
                  <p className="text-sm text-foreground/60">No forum telemetry events yet.</p>
                ) : null}
              </div>
            </div>
          </div>

          {activeVoiceConnections.length ? (
            <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
              <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
                <h3 className="text-xl font-bold mb-4">Active Voice Connections</h3>
                <div className="space-y-2">
                  {activeVoiceConnections.slice(0, 12).map((entry, index) => {
                    const inviteUrl = entry.guildId ? `https://discord.com/channels/${entry.guildId}/${entry.channelId || ""}` : null
                    return (
                      <a
                        key={`${entry.guildId}-${entry.channelId}-${index}`}
                        href={inviteUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm transition hover:border-primary/50 hover:bg-card/50"
                      >
                      <div className="truncate">
                        <p className="font-semibold">
                          Guild {entry.guildName ? `${entry.guildName} (${entry.guildId || "Unknown"})` : entry.guildId || "Unknown"}
                        </p>
                        <p className="text-foreground/60 text-xs">
                          Channel {entry.channelName ? `${entry.channelName} (${entry.channelId || "Unknown"})` : entry.channelId || "Unknown"}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {entry.listeners} listeners
                      </span>
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {!!botSummary.length && (
            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {botSummary.map((stat, index) => (
                  <div
                    key={`${stat.label}-${index}`}
                    className={`p-4 rounded-xl border border-border/40 ${PANEL_BG} ${CARD_HOVER}`}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/40 mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-primary">{stat.value}</p>
                    <p className="text-xs text-foreground/60 mt-1">{stat.detail}</p>
                  </div>
                ))}
              </div>
              <div className={`p-6 rounded-xl border border-border/40 ${PANEL_BG} ${CARD_HOVER}`}>
                <h3 className="text-lg font-semibold mb-4">Bot Telemetry (last {botHistoryChart.length} samples)</h3>
                {botHistoryChart.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={botHistoryChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" />
                      <YAxis yAxisId="left" stroke="rgba(255,255,255,0.6)" />
                      <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.4)" />
                      <Tooltip contentStyle={tooltipStyles} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="guilds" name="Guilds" stroke="#22C55E" strokeWidth={3} dot={{ r: 0 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="listeners"
                        name="Active listeners"
                        stroke="#6B46C1"
                        strokeWidth={3}
                        dot={{ r: 0 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="response"
                        name="Avg response (ms)"
                        stroke="#F97316"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={{ r: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-foreground/60">No bot telemetry snapshots recorded yet.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`p-6 rounded-xl border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <p className="text-sm text-foreground/60 mb-2">Page Views (24h)</p>
              <p className="text-3xl font-bold">{formatNumber(data.pageViews24h)}</p>
              <p className="text-xs text-foreground/50">From consented site telemetry</p>
            </div>
            <div className={`p-6 rounded-xl border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <p className="text-sm text-foreground/60 mb-2">Unique Visitors (24h)</p>
              <p className="text-3xl font-bold">{formatNumber(data.uniqueVisitors24h)}</p>
              <p className="text-xs text-foreground/50">Hashed IP + user-agent fingerprint</p>
            </div>
            <div className={`p-6 rounded-xl border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <p className="text-sm text-foreground/60 mb-2">Tracked Routes</p>
              <p className="text-3xl font-bold">{formatNumber(data.topPages.length)}</p>
              <p className="text-xs text-foreground/50">Unique paths actively monitored</p>
            </div>
            <div className={`p-6 rounded-xl border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <p className="text-sm text-foreground/60 mb-2">Data Freshness</p>
              <p className="text-3xl font-bold">{connectionState === "connected" ? "Live" : "Cached"}</p>
              <p className="text-xs text-foreground/50">Socket feed every 30 seconds</p>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="w-full py-20 px-4 space-y-12">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} animate-fade-in-blur ${CARD_HOVER}`}>
            <h2 className="text-2xl font-bold mb-6 animate-slide-up-fade">Monthly Traffic Overview</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip contentStyle={tooltipStyles} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend />
                <Line type="monotone" dataKey="views" name="Page Views" stroke="#FF8C00" strokeWidth={3} dot={{ fill: "#FF8C00", r: 6 }} />
                <Line
                  type="monotone"
                  dataKey="visitors"
                  name="Unique Visitors"
                  stroke="#6B46C1"
                  strokeWidth={3}
                  dot={{ fill: "#6B46C1", r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} animate-fade-in-blur animation-delay-200 ${CARD_HOVER}`}>
            <h2 className="text-2xl font-bold mb-6 animate-slide-up-fade">Daily Traffic &amp; Visitors</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.streamsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip contentStyle={tooltipStyles} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Area type="monotone" dataKey="views" name="Page Views" stroke="#FF8C00" fill="#FF8C00" fillOpacity={0.3} />
                <Area type="monotone" dataKey="visitors" name="Unique Visitors" stroke="#6B46C1" fill="#6B46C1" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} animate-fade-in-blur animation-delay-400 ${CARD_HOVER}`}>
              <h2 className="text-2xl font-bold mb-6 animate-slide-up-fade">Top Routes (share)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={data.sourceDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                    {data.sourceDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyles}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    labelFormatter={(label) => label || "Unknown source"}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} animate-fade-in-blur animation-delay-400 ${CARD_HOVER}`}>
              <h2 className="text-2xl font-bold mb-6 animate-slide-up-fade">Route Performance (last 14 days)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.streamsData.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" />
                  <YAxis stroke="rgba(255,255,255,0.6)" />
                  <Tooltip contentStyle={tooltipStyles} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Area type="monotone" dataKey="views" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.25} name="Views" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Metrics */}
      <section className="w-full py-20 px-4 bg-card/20 border-y border-border">
        <div className="max-w-6xl mx-auto space-y-12">
          <div>
            <h2 className="text-4xl font-bold mb-12 text-center">Performance Summary</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {data.performanceMetrics.map((metric) => (
                <div key={metric.metric} className={`p-6 rounded-lg border border-border/60 ${PANEL_BG} ${CARD_HOVER}`}>
                  <p className="text-sm text-foreground/60 mb-2">{metric.metric}</p>
                  <p className="text-3xl font-bold text-primary mb-2">{metric.value}</p>
                  <p className="text-foreground/60 text-sm">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className={`p-6 rounded-lg border border-border/60 ${PANEL_BG} ${CARD_HOVER}`}>
              <h3 className="text-xl font-semibold mb-4">Top Routes (lifetime)</h3>
              <div className="space-y-4">
                {topRoutes.map((page) => (
                  <div key={page.path} className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3">
                    <div>
                      <p className="font-medium">{page.path || "/"}</p>
                      <p className="text-xs text-foreground/50">Tracked via metrics pipeline</p>
                    </div>
                    <span className="text-lg font-semibold text-primary">{page.views.toLocaleString()}</span>
                  </div>
                ))}
                {!topRoutes.length && <p className="text-sm text-foreground/60">No routes tracked yet.</p>}
              </div>
            </div>

            <div className={`p-6 rounded-lg border border-border/60 ${PANEL_BG} ${CARD_HOVER}`}>
              <h3 className="text-xl font-semibold mb-4">Geo Distribution (Top 10)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={geoSample}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                  <YAxis stroke="rgba(255,255,255,0.6)" />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
                  <Bar dataKey="value" name="Views" fill="#22C55E" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-1 gap-6">
            <div className={`p-6 rounded-lg border border-border/50 ${PANEL_BG} ${CARD_HOVER}`}>
              <h3 className="text-xl font-semibold mb-4">Engagement Snapshot</h3>
              <div className="space-y-3">
                {data.engagementMetrics.slice(0, 3).map((metric) => (
                  <div key={metric.metric} className="flex items-center justify-between border border-border/40 rounded-lg px-4 py-3">
                    <div>
                      <p className="font-semibold">{metric.metric}</p>
                      <p className="text-xs text-foreground/60">{metric.detail}</p>
                    </div>
                    <span className="text-primary font-semibold">{metric.value}</span>
                  </div>
                ))}
                {!data.engagementMetrics.length && (
                  <p className="text-sm text-foreground/60">No engagement metrics recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Engagement Insights</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {data.engagementMetrics.map((metric) => (
              <div key={metric.metric} className={`p-6 rounded-lg border border-border/60 ${PANEL_BG} ${CARD_HOVER}`}>
                <p className="text-sm text-foreground/60 mb-2">{metric.metric}</p>
                <p className="text-3xl font-bold text-primary mb-2">{metric.value}</p>
                <p className="text-foreground/60 text-sm">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
