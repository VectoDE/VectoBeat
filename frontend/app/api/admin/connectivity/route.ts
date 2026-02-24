import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"
import { apiClient } from "@/lib/api-client"

type Service = { label: string; key: string; url?: string | null; status: "online" | "offline" | "missing" }

const SERVICE_KEYS: Array<{ label: string; key: string; envKey: string }> = [
  { label: "Database", key: "DATABASE_URL", envKey: "DATABASE_URL" },
  { label: "Redis", key: "REDIS_URL", envKey: "REDIS_URL" },
  { label: "Cache", key: "CACHE_URL", envKey: "CACHE_URL" },
  { label: "Upstash REST", key: "UPSTASH_REDIS_REST_URL", envKey: "UPSTASH_REDIS_REST_URL" },
  { label: "Upstash WS", key: "UPSTASH_REDIS_WS_URL", envKey: "UPSTASH_REDIS_WS_URL" },
  { label: "Status API", key: "BOT_STATUS_API_URL", envKey: "BOT_STATUS_API_URL" },
  { label: "Server settings", key: "SERVER_SETTINGS_API_URL", envKey: "SERVER_SETTINGS_API_URL" },
  { label: "Queue sync", key: "QUEUE_SYNC_ENDPOINT", envKey: "QUEUE_SYNC_ENDPOINT" },
  { label: "Telemetry", key: "TELEMETRY_INGEST_URL", envKey: "TELEMETRY_INGEST_URL" },
]

const BOT_ENV_KEYS = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "CACHE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_WS_URL",
  "QUEUE_SYNC_API_KEY",
  "QUEUE_SYNC_ENDPOINT",
])

const getEnvCandidates = (target: "frontend" | "bot") =>
  target === "bot"
    ? [
      path.resolve(process.cwd(), "../bot/.env"),
      path.resolve(process.cwd(), "../.env"),
      path.resolve(process.cwd(), "../bot/.env.development"),
      path.resolve(process.cwd(), "../bot/.env.local"),
    ]
    : [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../.env"),
      path.resolve(process.cwd(), ".env.development"),
      path.resolve(process.cwd(), ".env.local"),
    ]

const readEnvFile = async (target: "frontend" | "bot") => {
  const candidates = getEnvCandidates(target)
  for (const envPath of candidates) {
    try {
      const raw = await fs.readFile(envPath, "utf8")
      return dotenv.parse(raw)
    } catch {
      continue
    }
  }
  return {}
}

const getServiceAuthHeaderKey = (envKey: string) => {
  if (envKey === "BOT_STATUS_API_URL") return "BOT_STATUS_API_KEY"
  if (envKey === "SERVER_SETTINGS_API_URL") return "SERVER_SETTINGS_API_KEY"
  if (envKey === "QUEUE_SYNC_ENDPOINT") return "QUEUE_SYNC_API_KEY"
  if (envKey === "TELEMETRY_INGEST_URL") return "QUEUE_TELEMETRY_API_KEY"
  return null
}

const fetchWithTimeout = async (url: string, token: string | null = null, extraHeaders: Record<string, string> = {}) => {
  // If it's not an HTTP(S) URL (e.g. mysql://, redis://), we assume it's "online" 
  // if it's configured, as we can't easily ping these protocols via fetch.
  if (!/^https?:\/\//i.test(url)) {
    return true
  }
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 3000)
  try {
    const headers: HeadersInit = { ...extraHeaders }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    await apiClient(url, { signal: controller.signal, headers, cache: "no-store" })
    return true
  } catch (error: any) {
    // If it's an API error returning 400/401/403/404, the server is online but rejected the ping/auth
    if (
      error?.name === "ApiError" ||
      error?.status === 400 ||
      error?.status === 401 ||
      error?.status === 403 ||
      error?.status === 404
    ) {
      return true
    }
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
      let envVal = null
      let origin = "missing"

      if (fromBot) {
        if (botEnv[service.envKey]) {
          envVal = botEnv[service.envKey]
          origin = "bot .env"
        } else if (process.env[service.envKey]) {
          envVal = process.env[service.envKey]
          origin = "process.env"
        }
      } else {
        if (frontendEnv[service.envKey]) {
          envVal = frontendEnv[service.envKey]
          origin = "frontend .env"
        } else if (process.env[service.envKey]) {
          envVal = process.env[service.envKey]
          origin = "process.env"
        }
      }

      if (!envVal) return { label: service.label, key: service.key, url: null, status: "missing" }

      // Determine authenticaton header key if applicable
      const authKey = getServiceAuthHeaderKey(service.envKey)
      const envAuth = authKey ? (fromBot ? botEnv[authKey] || process.env[authKey] : frontendEnv[authKey] || process.env[authKey]) : null

      // Build extra headers for specific services
      const extraHeaders: Record<string, string> = {}
      if (service.key === "BOT_STATUS_API_URL" && envAuth) {
        extraHeaders["x-api-key"] = envAuth
        extraHeaders["x-bot-status-api-key"] = envAuth
        extraHeaders["x-status-api-key"] = envAuth
      }

      const online = await fetchWithTimeout(envVal, envAuth || null, extraHeaders)

      // eslint-disable-next-line no-console
      console.log(`[Connectivity] ${service.label} (${service.key}): ${online ? "online" : "offline"} - Origin: ${origin} - URL: ${envVal?.substring(0, 30)}...`)

      return { label: service.label, key: service.key, url: envVal, status: online ? "online" : "offline" }
    }),
  )

  return NextResponse.json({ services })
}
