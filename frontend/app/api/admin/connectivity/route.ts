import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"

type Service = { label: string; key: string; url?: string | null; status: "online" | "offline" | "missing" }

const SERVICE_KEYS: Array<{ label: string; key: string; envKey: string }> = [
  { label: "Database", key: "database", envKey: "DATABASE_URL" },
  { label: "Redis", key: "redis", envKey: "REDIS_URL" },
  { label: "Cache", key: "cache", envKey: "CACHE_URL" },
  { label: "Upstash REST", key: "upstash_rest", envKey: "UPSTASH_REDIS_REST_URL" },
  { label: "Upstash WS", key: "upstash_ws", envKey: "UPSTASH_REDIS_WS_URL" },
  { label: "Status API", key: "status_api", envKey: "BOT_STATUS_API_URL" },
  { label: "Server settings", key: "server_settings", envKey: "SERVER_SETTINGS_API_URL" },
  { label: "Queue sync", key: "queue_sync", envKey: "QUEUE_SYNC_ENDPOINT" },
  { label: "Telemetry", key: "telemetry", envKey: "TELEMETRY_INGEST_URL" },
]

const BOT_ENV_KEYS = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "CACHE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_WS_URL",
  "QUEUE_SYNC_ENDPOINT",
])

const getEnvPath = (target: "frontend" | "bot") =>
  target === "bot" ? path.resolve(process.cwd(), "../bot/.env") : path.resolve(process.cwd(), ".env")

const readEnvFile = async (target: "frontend" | "bot") => {
  const envPath = getEnvPath(target)
  try {
    const raw = await fs.readFile(envPath, "utf8")
    return dotenv.parse(raw)
  } catch {
    return {}
  }
}

const fetchWithTimeout = async (url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    return true
  }
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(id)
  }
}

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const [botEnv, frontendEnv] = await Promise.all([readEnvFile("bot"), readEnvFile("frontend")])

  const services: Service[] = await Promise.all(
    SERVICE_KEYS.map(async (service) => {
      const fromBot = BOT_ENV_KEYS.has(service.envKey)
      const envVal = fromBot ? botEnv[service.envKey] || process.env[service.envKey] : frontendEnv[service.envKey] || process.env[service.envKey]
      if (!envVal) return { label: service.label, key: service.key, url: null, status: "missing" }
      const online = await fetchWithTimeout(envVal)
      return { label: service.label, key: service.key, url: envVal, status: online ? "online" : "offline" }
    }),
  )

  return NextResponse.json({ services })
}
