import { type NextRequest } from "next/server"
import { verifyUserApiKey } from "./db"

const DEFAULT_HEADER_KEYS = [
  "authorization",
  "x-api-key",
  "x-status-api-key",
  "x-bot-status-api-key",
  "x-server-settings-key",
  "x-analytics-key",
  "x-control-panel-key",
  "x-queue-telemetry-key",
  "x-success-pod-key",
  "x-automation-key",
  "x-queue-sync-key",
]

const DEFAULT_QUERY_KEYS = ["token", "key", "api_key"]

const AUTH_BYPASS =
  process.env.DISABLE_API_AUTH === "1" ||
  process.env.ALLOW_UNAUTHENTICATED === "1" ||
  process.env.SKIP_API_AUTH === "1"

export const normalizeToken = (token?: string | null) => {
  if (!token) return ""
  const trimmed = token.trim()
  // Strip surrounding quotes to tolerate quoted envs in compose or shell exports.
  const unquoted = trimmed.replace(/^['"]+|['"]+$/g, "")
  return unquoted.trim()
}

export const expandSecrets = (...values: Array<string | null | undefined>) =>
  values
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => normalizeToken(value))
    .filter(Boolean)

const isLocalRequest = (request: NextRequest) => {
  const host = (request.headers.get("host") || "").toLowerCase()
  if (host.includes("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") || host.startsWith("::1")) {
    return true
  }
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const forwardedIp = forwarded.split(",")[0]?.trim()
  return forwardedIp === "127.0.0.1" || forwardedIp === "::1"
}

export const extractToken = (
  request: NextRequest,
  options?: { headerKeys?: string[]; queryKeys?: string[] },
): string | null => {
  const headerKeys = options?.headerKeys ?? DEFAULT_HEADER_KEYS
  const queryKeys = options?.queryKeys ?? DEFAULT_QUERY_KEYS

  const authHeader = request.headers.get("authorization")
  if (authHeader) {
    const normalized = authHeader.trim()
    const parts = normalized.split(/\s+/)
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      return parts[1]
    }
    if (/^bearer/i.test(normalized)) {
      return normalized.slice(6).trim()
    }
  }

  for (const headerKey of headerKeys) {
    const value = request.headers.get(headerKey)
    if (value && value.trim()) {
      return value.trim()
    }
  }

  for (const queryKey of queryKeys) {
    const value = request.nextUrl.searchParams.get(queryKey)
    if (value && value.trim()) {
      return value.trim()
    }
  }

  return null
}

export const authorizeRequest = (
  request: NextRequest,
  allowedSecrets: string[],
  options?: { allowLocalhost?: boolean; headerKeys?: string[]; queryKeys?: string[] },
) => {
  if (AUTH_BYPASS) {
    return true
  }
  if (!allowedSecrets.length) {
    return true
  }

  if (options?.allowLocalhost && isLocalRequest(request)) {
    return true
  }

  const token = normalizeToken(extractToken(request, options))
  if (!token) return false
  if (allowedSecrets.includes(token)) return true

  // Allow user-scoped API keys as a fallback when provided with a discordId hint.
  const discordId =
    request.headers.get("x-discord-id")?.trim() ||
    request.nextUrl.searchParams.get("discordId")?.trim() ||
    request.nextUrl.searchParams.get("userId")?.trim() ||
    null
  if (discordId && verifyUserApiKey(token, discordId)) {
    return true
  }

  return false
}
