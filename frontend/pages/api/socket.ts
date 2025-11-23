import type { NextApiRequest, NextApiResponse } from "next"
import { ensureSocketServer } from "@/lib/socket-server"

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await ensureSocketServer(res, { withMetrics: true })
    res.end()
  } catch (error) {
    console.error("[VectoBeat] Socket initialisation failed:", error)
    res.status(500).end()
  }
}
