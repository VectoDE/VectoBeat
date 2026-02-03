import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// --- Rate Limiter Logic ---
// Simple in-memory rate limiter (per instance)
// For distributed production, use Redis via @upstash/redis or similar HTTP-based client
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 100 // 100 requests per minute
const ipRequests = new Map<string, { count: number; expiresAt: number }>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of ipRequests.entries()) {
    if (now > data.expiresAt) {
      ipRequests.delete(ip)
    }
  }
}, 60 * 1000)

// --- Cookie Logic Constants ---
const ONE_YEAR = 60 * 60 * 24 * 365

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Rate Limiter (applies to /api routes)
  if (pathname.startsWith('/api')) {
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1"
    const now = Date.now()

    // Clean expired for this IP immediately
    const record = ipRequests.get(ip)
    if (record && now > record.expiresAt) {
      ipRequests.delete(ip)
    }

    const current = ipRequests.get(ip) || { count: 0, expiresAt: now + RATE_LIMIT_WINDOW }
    
    if (current.count >= RATE_LIMIT_MAX) {
      return new NextResponse("Too Many Requests", { status: 429 })
    }

    ipRequests.set(ip, {
      count: current.count + 1,
      expiresAt: current.expiresAt
    })
  }

  // 2. Cookie Logic (applies to non-api routes)
  // Preserving original behavior: proxy.ts excluded 'api'
  const response = NextResponse.next()

  if (!pathname.startsWith('/api')) {
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
  // Match everything except _next, static files, and favicon
  // This covers both API routes (for rate limiting) and pages (for cookies)
  matcher: ["/((?!_next|static|favicon.ico).*)"],
}
