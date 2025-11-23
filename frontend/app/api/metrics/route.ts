import { type NextRequest, NextResponse } from "next/server"
import { getAllMetrics, getAnalyticsOverview, getHomeMetrics } from "@/lib/metrics"

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope")

  if (scope === "home") {
    const home = await getHomeMetrics()
    return NextResponse.json(home)
  }

  if (scope === "analytics") {
    const analytics = await getAnalyticsOverview()
    return NextResponse.json(analytics)
  }

  const { home, analytics } = await getAllMetrics()
  return NextResponse.json({ home, analytics })
}
