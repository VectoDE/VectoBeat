import type { Server as HTTPServer } from "http"
import type { Server as IOServer } from "socket.io"

declare module "http" {
  interface Server {
    io?: IOServer
    meta?: {
      metricsInterval?: NodeJS.Timeout | null
    }
  }
}

declare module "net" {
  interface Socket {
    server: HTTPServer & {
      io?: IOServer
      meta?: {
        metricsInterval?: NodeJS.Timeout | null
      }
    }
  }
}

export {}
