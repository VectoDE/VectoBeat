"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { CombinedMetrics, HomeMetrics, SummaryStat } from "@/lib/metrics"
import { Headphones, Users, Music, Shield, Zap, Radio } from "lucide-react"
import { apiClient } from "@/lib/api-client"

type MetricsStatsCopy = {
  blogPosts: { label: string; featured: string }
  blogViews: { label: string; avgPerPost: string; noPosts: string }
  siteViews: { label: string; last24h: string }
  activeServers: { label: string }
  activeUsers: { label: string }
  uptime: { label: string; latency: string }
  telemetry: { available: string; unavailable: string }
}

interface HomeMetricsProps {
  initialMetrics: HomeMetrics
  copy?: {
    title?: string
    status?: string
    live?: string
    connecting?: string
    offline?: string
    updated?: string
  }
  statsCopy?: MetricsStatsCopy
}

const iconMap = [Headphones, Users, Music, Shield, Zap, Radio]

const DEFAULT_STATS_COPY: MetricsStatsCopy = {
  blogPosts: { label: "Blog posts", featured: "{{count}} featured" },
  blogViews: { label: "Blog views", avgPerPost: "{{value}} avg/post", noPosts: "No articles yet" },
  siteViews: { label: "Site views (30d)", last24h: "{{value}} last 24h" },
  activeServers: { label: "Active servers" },
  activeUsers: { label: "Active listeners" },
  uptime: { label: "Uptime", latency: "Latency {{latency}}" },
  telemetry: { available: "Bot telemetry", unavailable: "No telemetry" },
}

const formatLatency = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.max(Math.round(value), 0)}ms` : "0ms"

const localizeStats = (stats: SummaryStat[], totals: HomeMetrics["totals"], copy: MetricsStatsCopy): SummaryStat[] => {
  const extractToken = (value?: string | null) => (value ? value.split(" ")[0] ?? value : "0")
  const includesPhrase = (value?: string | null, phrase?: string) =>
    value && phrase ? value.toLowerCase().includes(phrase) : false
  const latencyLabel = formatLatency(totals.responseTimeMs)

  return stats.map((stat) => {
    switch (stat.label) {
      case "Blog Posts": {
        const featuredCount = String(totals.featuredPosts ?? 0)
        return {
          ...stat,
          label: copy.blogPosts.label,
          change: copy.blogPosts.featured.replace("{{count}}", featuredCount),
        }
      }
      case "Blog Views": {
        const hasPosts = (totals.totalPosts ?? 0) > 0 && !includesPhrase(stat.change, "no articles yet")
        const avgValue = hasPosts ? extractToken(stat.change) : "0"
        return {
          ...stat,
          label: copy.blogViews.label,
          change: hasPosts ? copy.blogViews.avgPerPost.replace("{{value}}", avgValue) : copy.blogViews.noPosts,
        }
      }
      case "Site Views (30d)": {
        const last24hValue = extractToken(stat.change)
        return {
          ...stat,
          label: copy.siteViews.label,
          change: copy.siteViews.last24h.replace("{{value}}", last24hValue),
        }
      }
      case "Active Servers": {
        const hasTelemetry = !includesPhrase(stat.change, "no telemetry")
        return {
          ...stat,
          label: copy.activeServers.label,
          change: hasTelemetry ? copy.telemetry.available : copy.telemetry.unavailable,
        }
      }
      case "Active Users": {
        const hasTelemetry = !includesPhrase(stat.change, "no telemetry")
        return {
          ...stat,
          label: copy.activeUsers.label,
          change: hasTelemetry ? copy.telemetry.available : copy.telemetry.unavailable,
        }
      }
      case "Uptime": {
        const hasTelemetry = !includesPhrase(stat.change, "no telemetry")
        return {
          ...stat,
          label: copy.uptime.label,
          change: hasTelemetry ? copy.uptime.latency.replace("{{latency}}", latencyLabel) : copy.telemetry.unavailable,
        }
      }
      default:
        return stat
    }
  })
}

const applyStatsCopy = (metrics: HomeMetrics, statsCopy: MetricsStatsCopy): HomeMetrics => ({
  ...metrics,
  stats: localizeStats(metrics.stats, metrics.totals, statsCopy),
})

export function HomeMetricsPanel({ initialMetrics, copy, statsCopy }: HomeMetricsProps) {
  const localizeMetrics = useCallback(
    (value: HomeMetrics) => applyStatsCopy(value, statsCopy ?? DEFAULT_STATS_COPY),
    [statsCopy],
  )
  const [metrics, setMetrics] = useState(initialMetrics)
  const localizedMetrics = useMemo(() => localizeMetrics(metrics), [metrics, localizeMetrics])
  const [state, setState] = useState<"connecting" | "connected" | "error">("connecting")
  const [updatedLabel, setUpdatedLabel] = useState(() =>
    new Date(initialMetrics.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  )
  const labels = {
    title: copy?.title ?? "",
    status: copy?.status ?? "Status",
    live: copy?.live ?? "Live",
    connecting: copy?.connecting ?? "Connecting...",
    offline: copy?.offline ?? "Offline",
    updated: copy?.updated ?? "Updated",
  }

  useEffect(() => {
    let mounted = true
    let socket: Socket | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const fetchLatest = async () => {
      try {
        const payload = await apiClient<HomeMetrics>("/api/metrics?scope=home", { cache: "no-store" })
        if (mounted && payload) {
          setMetrics(payload)
          setUpdatedLabel(new Date(payload.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        }
      } catch (error) {
        console.error("[VectoBeat] Home metrics polling failed:", error)
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

    const setup = async () => {
      try {
        await apiClient("/api/socket")
        socket = io({ path: "/api/socket" })

        socket.on("connect", () => {
          if (!mounted) return
          setState("connected")
          stopPolling()
        })
        socket.on("connect_error", () => {
          if (!mounted) return
          setState("error")
          startPolling()
        })
        socket.on("disconnect", () => {
          if (!mounted) return
          setState("error")
          startPolling()
        })

        socket.on("stats:update", (payload: CombinedMetrics) => {
          if (!mounted) return
          if (payload?.home) {
            setMetrics(payload.home)
            setUpdatedLabel(new Date(payload.home.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
          }
        })
      } catch (error) {
        console.error("[VectoBeat] Failed to connect home metrics socket:", error)
        if (mounted) {
          setState("error")
          startPolling()
        }
      }
    }

    void setup()
    return () => {
      mounted = false
      socket?.disconnect()
      if (pollTimer) {
        clearInterval(pollTimer)
      }
    }
  }, [localizeMetrics])

  const targetLabels = [
    (statsCopy ?? DEFAULT_STATS_COPY).blogPosts.label,
    (statsCopy ?? DEFAULT_STATS_COPY).blogViews.label,
    (statsCopy ?? DEFAULT_STATS_COPY).siteViews.label,
    (statsCopy ?? DEFAULT_STATS_COPY).activeServers.label,
    (statsCopy ?? DEFAULT_STATS_COPY).activeUsers.label,
    (statsCopy ?? DEFAULT_STATS_COPY).uptime.label,
  ]
  const stats = targetLabels
    .map((label) => localizedMetrics.stats.find((stat) => stat.label === label))
    .filter((stat): stat is SummaryStat => Boolean(stat))

  return (
    <section className="w-full py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
          <h2 className="text-2xl font-semibold">{labels.title}</h2>
          <p className="text-xs text-foreground/60" suppressHydrationWarning>
            {labels.status}:{" "}
            <span className={state === "connected" ? "text-primary" : "text-red-400"}>
              {state === "connected" ? labels.live : state === "connecting" ? labels.connecting : labels.offline}
            </span>{" "}
            - {labels.updated} {updatedLabel}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {stats.map((stat, index) => {
            const Icon = iconMap[index] ?? Headphones
            return (
              <div key={stat.label} className="text-center transform hover:scale-110 transition-transform duration-300 group">
                <div className="flex justify-center mb-3 group-hover:scale-125 transition-transform duration-300">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <p className="text-foreground/60 text-sm font-medium">{stat.label}</p>
                <p className="text-foreground/40 text-xs mt-1">{stat.change}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
