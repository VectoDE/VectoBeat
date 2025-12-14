import { getHomeMetrics, type HomeMetrics } from "./metrics"

const resolveBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  (process.env.PORT ? `http://localhost:${process.env.PORT}` : null) ||
  "http://localhost:3050"

export const fetchHomeMetrics = async (): Promise<HomeMetrics | null> => {
  const skipRemote =
    process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_REMOTE_METRICS === "1"

  const candidates = Array.from(
    new Set(
      [
        resolveBaseUrl(),
        process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null,
        process.env.PORT ? `http://localhost:${process.env.PORT}` : null,
        "http://127.0.0.1:3000",
        "http://localhost:3000",
      ].filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ).map((url) => url.replace(/\/$/, ""))

  try {
    if (!skipRemote) {
      for (const baseUrl of candidates) {
        try {
          const response = await fetch(`${baseUrl}/api/metrics?scope=home`, { next: { revalidate: 300 } })
          if (response.ok) {
            return (await response.json()) as HomeMetrics
          }
        } catch {
          // try next candidate
          continue
        }
      }
      throw new Error("Home metrics API unreachable on all candidates")
    }
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
