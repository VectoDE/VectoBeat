"use client"

import { useEffect, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { QueueSnapshot, QueueTrackSummary } from "@/types/queue-sync"

interface QueueSyncPanelProps {
  guildId: string
  enabled: boolean
  realtime?: boolean
}

type PanelStatus = "idle" | "connecting" | "live" | "snapshot" | "disabled"

const initialStatus = (enabled: boolean, realtime: boolean): PanelStatus => {
  if (!enabled) {
    return "disabled"
  }
  return realtime ? "idle" : "snapshot"
}

const formatDuration = (duration: number) => {
  if (!Number.isFinite(duration) || duration <= 0) return "0:00"
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

const requesterLabel = (track: QueueTrackSummary) => {
  if (!track.requester) return ""
  return ` · requested by ${track.requester}`
}

export function QueueSyncPanel({ guildId, enabled, realtime = true }: QueueSyncPanelProps) {
  const [state, setState] = useState<QueueSnapshot | null>(null)
  const [status, setStatus] = useState<PanelStatus>(initialStatus(enabled, realtime))

  useEffect(() => {
    if (!enabled || !guildId) {
      queueMicrotask(() => {
        setStatus("disabled")
        setState(null)
      })
      return
    }
    queueMicrotask(() => {
      setStatus(realtime ? "idle" : "snapshot")
    })
  }, [enabled, guildId, realtime])

  useEffect(() => {
    if (!enabled || !guildId) {
      return
    }
    let mounted = true
    let socket: Socket | null = null
    const fetchInitial = async () => {
      try {
        const response = await fetch(`/api/queue-sync?guildId=${guildId}`, { cache: "no-store" })
        if (!response.ok) {
          if (response.status !== 404) {
            console.warn("[VectoBeat] Failed to load queue snapshot:", response.status)
          }
          return
        }
        const payload = (await response.json()) as QueueSnapshot
        if (mounted) {
          setState(payload)
        }
      } catch (error) {
        console.error("[VectoBeat] Queue snapshot fetch failed:", error)
      }
    }

    const connectSocket = async () => {
      if (!realtime) {
        return
      }
      try {
        setStatus("connecting")
        await fetch("/api/socket")
        socket = io({ path: "/api/socket" })
        socket.emit("queue:join", guildId)

        socket.on("connect", () => {
          if (!mounted) return
          setStatus("live")
        })

        socket.on("queue:update", (payload: QueueSnapshot) => {
          if (!mounted) return
          if (payload.guildId === guildId) {
            setState(payload)
          }
        })

        socket.on("disconnect", () => {
          if (!mounted) return
          setStatus("connecting")
        })
      } catch (error) {
        console.error("[VectoBeat] Failed to initialize queue sync socket:", error)
        if (mounted) {
          setStatus("connecting")
        }
      }
    }

    void fetchInitial()
    void connectSocket()

    return () => {
      mounted = false
      if (socket) {
        socket.emit("queue:leave", guildId)
        socket.disconnect()
      }
    }
  }, [guildId, enabled, realtime])

  if (!enabled) {
    return null
  }

  const badgeClasses =
    status === "live"
      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
      : status === "snapshot"
        ? "bg-sky-500/15 text-sky-200 border border-sky-500/40"
        : "bg-amber-500/15 text-amber-200 border border-amber-500/40"
  const badgeLabel =
    status === "live" ? "Streaming" : status === "connecting" ? "Connecting..." : status === "snapshot" ? "Snapshot" : "Idle"
  const description = realtime
    ? state
      ? "Live queue data across all devices."
      : "Waiting for the next queue update..."
    : "Snapshots refresh whenever the bot reports queue changes. Upgrade to Pro for live sync."
  const updatedAtLabel =
    !realtime && state?.updatedAt ? `Last snapshot ${new Date(state.updatedAt).toLocaleTimeString()}` : null

  return (
    <div className="rounded-lg border border-border/50 bg-card/20 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Real-time Queue Sync</h3>
          <p className="text-sm text-foreground/60">{description}</p>
          {updatedAtLabel && <p className="text-xs text-foreground/50">{updatedAtLabel}</p>}
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeClasses}`}>{badgeLabel}</span>
      </div>

      {state?.nowPlaying ? (
        <div className="rounded-lg border border-border/40 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Now playing</p>
          <p className="text-lg font-semibold">{state.nowPlaying.title}</p>
          <p className="text-sm text-foreground/70">{state.nowPlaying.author}</p>
          <p className="text-xs text-foreground/60 mt-1">
            {formatDuration(state.nowPlaying.duration)}
            {requesterLabel(state.nowPlaying)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-foreground/60">No active track yet.</p>
      )}

      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Queue</p>
        {state && state.queue.length > 0 ? (
          <ol className="space-y-2 text-sm text-foreground/80">
            {state.queue.slice(0, 10).map((track, index) => (
              <li key={`${track.title}-${index}`} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {index + 1}. {track.title}
                  </p>
                  <p className="text-xs text-foreground/60">
                    {track.author}
                    {requesterLabel(track)}
                  </p>
                </div>
                <span className="text-xs text-foreground/50">{formatDuration(track.duration)}</span>
              </li>
            ))}
            {state.queue.length > 10 && (
              <li className="text-xs text-foreground/50">+{state.queue.length - 10} more</li>
            )}
          </ol>
        ) : (
          <p className="text-sm text-foreground/60">Queue is empty.</p>
        )}
      </div>
    </div>
  )
}
