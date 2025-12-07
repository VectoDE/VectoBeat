import { NextRequest, NextResponse } from "next/server"
import { recordSitePageView } from "@/lib/db"
import { resolveClientIp, resolveClientLocation } from "@/lib/request-metadata"

type NextRequestWithGeo = NextRequest & {
  geo?: {
    country?: string | null
  }
}

export async function POST(request: NextRequestWithGeo) {
  try {
    const body = await request.json().catch(() => ({}))
    const incomingPath = typeof body?.path === "string" ? body.path : request.nextUrl.pathname
    const path = incomingPath?.startsWith("/") ? incomingPath : `/${incomingPath || ""}`
    if (!path || path.length > 500) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 })
    }

    const referrer =
      typeof body?.referrer === "string" && body.referrer.length
        ? body.referrer
        : request.headers.get("referer") || null

    const location = resolveClientLocation(request)
    await recordSitePageView({
      path,
      referrer,
      userAgent: request.headers.get("user-agent"),
      country: location,
      ip: resolveClientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to track page view:", error)
    return NextResponse.json({ error: "Failed to track" }, { status: 500 })
  }
}
