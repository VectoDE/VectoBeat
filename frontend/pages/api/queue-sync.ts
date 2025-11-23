import type { NextApiRequest, NextApiResponse } from "next"
import { ensureSocketServer } from "@/lib/socket-server"
import { getQueueSnapshot, setQueueSnapshot } from "@/lib/queue-sync-store"
import type { QueueSnapshot } from "@/types/queue-sync"

const QUEUE_SYNC_API_KEY = process.env.QUEUE_SYNC_API_KEY || ""

const normalizeSnapshot = (body: any): QueueSnapshot | null => {
  const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
  if (!guildId) {
    return null
  }

  const updatedAt = typeof body?.updatedAt === "string" ? body.updatedAt : new Date().toISOString()
  const reason = typeof body?.reason === "string" ? body.reason : undefined
  const metadata = typeof body?.metadata === "object" && body.metadata !== null ? body.metadata : null
  const paused = Boolean(body?.paused)
  const volume = Number.isFinite(Number(body?.volume)) ? Number(body.volume) : null

  const normalizeTrack = (track: any) => ({
    title: typeof track?.title === "string" ? track.title : "Unknown",
    author: typeof track?.author === "string" ? track.author : "Unknown",
    duration: Number.isFinite(Number(track?.duration)) ? Number(track.duration) : 0,
    uri: typeof track?.uri === "string" ? track.uri : null,
    artworkUrl: typeof track?.artworkUrl === "string" ? track.artworkUrl : null,
    source: typeof track?.source === "string" ? track.source : null,
    requester: typeof track?.requester === "string" ? track.requester : null,
  })

  const nowPlaying = body?.nowPlaying ? normalizeTrack(body.nowPlaying) : null
  const queue = Array.isArray(body?.queue) ? body.queue.map(normalizeTrack) : []

  return { guildId, updatedAt, reason, metadata, paused, volume, nowPlaying, queue }
}

type QueueSyncDeps = {
  getSnapshot?: typeof getQueueSnapshot
  saveSnapshot?: typeof setQueueSnapshot
  ensureSocket?: typeof ensureSocketServer
  apiKey?: string
}

export const createQueueSyncHandler = (deps: QueueSyncDeps = {}) => {
  const getSnapshot = deps.getSnapshot ?? getQueueSnapshot
  const saveSnapshot = deps.saveSnapshot ?? setQueueSnapshot
  const ensureSocket = deps.ensureSocket ?? ensureSocketServer
  const apiKey = deps.apiKey ?? QUEUE_SYNC_API_KEY

  const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === "GET") {
      const guildId = typeof req.query.guildId === "string" ? req.query.guildId : ""
      if (!guildId) {
        return res
          .status(200)
          .json({ ok: true, message: "queue_sync_online", requiresGuildId: true })
      }
      const snapshot = await getSnapshot(guildId)
      if (!snapshot) {
        return res.status(200).json({
          guildId,
          queue: [],
          nowPlaying: null,
          paused: false,
          volume: null,
          updatedAt: null,
          reason: "cold_start",
          metadata: null,
        })
      }
      return res.status(200).json(snapshot)
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" })
    }

    if (!apiKey) {
      return res.status(501).json({ error: "queue_sync_disabled" })
    }

    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: "unauthorized" })
    }

    const snapshot = normalizeSnapshot(req.body)
    if (!snapshot) {
      return res.status(400).json({ error: "invalid_payload" })
    }

    await saveSnapshot(snapshot)
    try {
      const io = await ensureSocket(res)
      io.to(`queue:${snapshot.guildId}`).emit("queue:update", snapshot)
    } catch (error) {
      console.error("[VectoBeat] Failed to emit queue sync event:", error)
    }

    return res.status(200).json({ ok: true })
  }

  return handler
}

const defaultHandler = createQueueSyncHandler()
export default defaultHandler
