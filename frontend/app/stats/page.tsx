export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { StatsControlPanel } from "@/components/stats-control-panel"
import { type AnalyticsOverview } from "@/lib/metrics"
import { apiClient } from "@/lib/api-client"

const getInternalBaseUrl = () =>
  process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

const fetchAnalyticsData = async (): Promise<AnalyticsOverview | null> => {
  try {
    return await apiClient<AnalyticsOverview>(`${getInternalBaseUrl()}/api/metrics?scope=analytics`, { cache: "no-store" })
  } catch (error) {
    console.error("[VectoBeat] Failed to load analytics from API:", error)
    return null
  }
}

export default async function StatsPage() {
  const analytics = await fetchAnalyticsData()

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {analytics ? (
        <StatsControlPanel initialData={analytics} />
      ) : (
        <section className="w-full py-32 px-4 text-center">
          <div className="max-w-xl mx-auto">
            <h1 className="text-4xl font-bold mb-4">Analytics unavailable</h1>
            <p className="text-foreground/70">
              We were unable to load the current analytics feed. Please try again later or verify the API/database connection.
            </p>
          </div>
        </section>
      )}
      <Footer />
    </div>
  )
}
