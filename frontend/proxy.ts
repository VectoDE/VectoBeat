import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// --- Security Headers ---
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

// --- Rate Limiter Logic ---
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX_GLOBAL = 100
const RATE_LIMIT_MAX_SENSITIVE = 60

const ipRequests = new Map<string, { count: number; expiresAt: number }>()
const sensitiveRateLimitStore = new Map<string, { count: number; resetAt: number }>()

let lastPurge = Date.now()

const purgeStaleSensitiveEntries = () => {
  const now = Date.now()
  if (now - lastPurge > RATE_LIMIT_WINDOW * 2) {
    for (const [k, v] of sensitiveRateLimitStore) {
      if (now > v.resetAt) sensitiveRateLimitStore.delete(k)
    }
    lastPurge = now
  }
}

const SENSITIVE_PREFIXES = [
  "/api/contact",
  "/api/newsletter",
  "/api/donate",
  "/api/checkout",
  "/api/auth",
  "/api/upload",
  "/api/support-tickets",
]

const checkSensitiveRateLimit = (key: string): boolean => {
  purgeStaleSensitiveEntries()
  const now = Date.now()
  const entry = sensitiveRateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    sensitiveRateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX_SENSITIVE) {
    return false
  }
  entry.count++
  return true
}

// --- Cookie Logic Constants ---
const ONE_YEAR = 60 * 60 * 24 * 365

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"

  // 1. Global rate limiter (applies to /api routes)
  if (pathname.startsWith("/api")) {
    const now = Date.now()

    const record = ipRequests.get(ip)
    if (record && now > record.expiresAt) {
      ipRequests.delete(ip)
    }

    const current = ipRequests.get(ip) || { count: 0, expiresAt: now + RATE_LIMIT_WINDOW }

    if (current.count >= RATE_LIMIT_MAX_GLOBAL) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      )
    }

    ipRequests.set(ip, {
      count: current.count + 1,
      expiresAt: current.expiresAt,
    })
  }

  // 2. Stricter rate limiting on sensitive endpoints
  const isSensitive = SENSITIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  if (isSensitive) {
    const key = `sensitive:${ip}:${pathname.split("/").slice(0, 4).join("/")}`
    if (!checkSensitiveRateLimit(key)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      )
    }
  }

  // 3. Build response with security headers
  const response = NextResponse.next()

  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value)
  }

  // 4. Cookie logic (applies to non-api routes)
  if (!pathname.startsWith("/api")) {
    const existing = request.cookies.get("lang")?.value

    if (!existing) {
      response.cookies.set("lang", "en", {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: ONE_YEAR,
      })
    }
  }

  return response
}

export const config = {
  matcher: ["/((?!_next|static|favicon.ico).*)"],
}
