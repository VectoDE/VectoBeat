import type { NextApiRequest, NextApiResponse } from "next"
import { ensureSocketServer } from "@/lib/socket-server"
import { getApiKeySecret, getApiKeySecrets } from "@/lib/api-keys"

const AUTH_TOKEN_TYPES = ["server_settings", "status_events"]

const normalizeGuildId = (value: unknown): string => {
  if (typeof value !== "string") return ""
  return value.trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "method_not_allowed" })
  }

  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  const header = req.headers.authorization
  if (!header || !secrets.some((token) => header === `Bearer ${token}`)) {
    return res.status(401).json({ error: "unauthorized" })
  }

  const guildId = normalizeGuildId(req.body?.guildId)
  const settings = (req.body as any)?.settings
  const tier = typeof (req.body as any)?.tier === "string" ? (req.body as any).tier : null

  if (!guildId || !settings) {
    return res.status(400).json({ error: "guildId_and_settings_required" })
  }

  try {
    const io = await ensureSocketServer(res)
    io.to(`settings:${guildId}`).emit("server-settings:update", { guildId, settings, tier })
    io.emit("server-settings:update", { guildId, settings, tier })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to broadcast server settings:", error)
    return res.status(500).json({ error: "broadcast_failed" })
  }
}
