import { getHomeMetrics, type HomeMetrics } from "./metrics"

const resolveBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3050")

export const fetchHomeMetrics = async (): Promise<HomeMetrics | null> => {
  const baseUrl = resolveBaseUrl().replace(/\/$/, "")
  try {
    const response = await fetch(`${baseUrl}/api/metrics?scope=home`, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`)
    }
    return (await response.json()) as HomeMetrics
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
