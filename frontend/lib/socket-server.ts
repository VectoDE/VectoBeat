import type { NextApiResponse } from "next"
import { Server as IOServer } from "socket.io"
import { getAllMetrics } from "@/lib/metrics"

type SocketMeta = {
  metricsInterval?: NodeJS.Timeout | null
}

type WithServer = {
  io?: IOServer
  meta?: SocketMeta
}

const SOCKET_PATH = "/api/socket"

const ensureMeta = (server: WithServer) => {
  if (!server.meta) {
    server.meta = {}
  }
  return server.meta
}

export const ensureSocketServer = async (
  res: NextApiResponse,
  options: { withMetrics?: boolean } = {},
): Promise<IOServer> => {
  const socket = res.socket as any
  if (!socket || !socket.server) {
    throw new Error("Socket server unavailable")
  }

  if (!socket.server.io) {
    const io = new IOServer(socket.server, {
      path: SOCKET_PATH,
      addTrailingSlash: false,
    })

    io.on("connection", (client) => {
      client.emit("stats:connected", { ok: true })

      client.on("queue:join", (guildId: string) => {
        if (typeof guildId === "string" && guildId.trim()) {
          client.join(`queue:${guildId}`)
          client.emit("queue:joined", { guildId })
        }
      })

      client.on("queue:leave", (guildId: string) => {
        if (typeof guildId === "string" && guildId.trim()) {
          client.leave(`queue:${guildId}`)
        }
      })

      client.on("settings:join", (guildId: string) => {
        if (typeof guildId === "string" && guildId.trim()) {
          client.join(`settings:${guildId}`)
          client.emit("settings:joined", { guildId })
        }
      })

      client.on("settings:leave", (guildId: string) => {
        if (typeof guildId === "string" && guildId.trim()) {
          client.leave(`settings:${guildId}`)
        }
      })
    })

    socket.server.io = io
    socket.server.meta = { metricsInterval: null }
  }

  const io: IOServer = socket.server.io
  const meta = ensureMeta(socket.server)

  if (options.withMetrics && !meta.metricsInterval) {
    const broadcastMetrics = async () => {
      try {
        const payload = await getAllMetrics()
        io.emit("stats:update", payload)
      } catch (error) {
        console.error("[VectoBeat] Failed to broadcast analytics:", error)
      }
    }

    await broadcastMetrics()
    meta.metricsInterval = setInterval(broadcastMetrics, 30_000)
  }

  return io
}
