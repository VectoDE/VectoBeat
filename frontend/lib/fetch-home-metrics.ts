import { getHomeMetrics, type HomeMetrics } from "./metrics"

const resolveBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3050")

export const fetchHomeMetrics = async (): Promise<HomeMetrics | null> => {
  const skipRemote =
    process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_REMOTE_METRICS === "1"

  const baseUrl = resolveBaseUrl().replace(/\/$/, "")
  try {
    if (!skipRemote) {
      const response = await fetch(`${baseUrl}/api/metrics?scope=home`, { next: { revalidate: 300 } })
      if (response.ok) {
        return (await response.json()) as HomeMetrics
      }
      throw new Error(`API responded with ${response.status}`)
    }
    // Build-time or explicitly skipped: use local fallback without logging noise.
    return await getHomeMetrics()
  } catch (apiError) {
    console.error("[VectoBeat] Failed to load home metrics via API:", apiError)
    try {
      return await getHomeMetrics()
    } catch (localError) {
      console.error("[VectoBeat] Local metrics fallback failed:", localError)
      return null
    }
  }
}
