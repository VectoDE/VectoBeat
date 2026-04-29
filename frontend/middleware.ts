import { NextRequest, NextResponse } from "next/server"

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

let lastPurge = Date.now()

const checkInMemoryRateLimit = (key: string): boolean => {
  const now = Date.now()

  if (now - lastPurge > RATE_LIMIT_WINDOW_MS * 2) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k)
    }
    lastPurge = now
  }

  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count++
  return true
}

const RATE_LIMITED_PREFIXES = [
  "/api/contact",
  "/api/newsletter",
  "/api/donate",
  "/api/checkout",
  "/api/auth",
  "/api/upload",
  "/api/support-tickets",
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"

  const isRateLimited = RATE_LIMITED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  if (isRateLimited) {
    const key = `mw:${ip}:${pathname.split("/").slice(0, 4).join("/")}`
    if (!checkInMemoryRateLimit(key)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      )
    }
  }

  const response = NextResponse.next()
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value)
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|apple-icon.png|uploads/).*)",
  ],
}
