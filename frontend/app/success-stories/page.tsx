import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { fetchHomeMetrics } from "@/lib/fetch-home-metrics"
import { formatCountWithPlus } from "@/lib/format-number"
import Link from "next/link"

const stories = [
  {
    title: "Nova Esports",
    industry: "Gaming & Tournaments",
    summary:
      "Needed a resilient audio layer for international tournaments with thousands of concurrent listeners and strict latency requirements.",
    impact: ["45% lower moderation workload via queue automation", "Median command latency held under 90ms", "Zero dropped streams across 12 finals"],
  },
  {
    title: "CampusFM Collective",
    industry: "Education",
    summary:
      "Student-run radio-style Discord network wanted analytics to understand peak study sessions and automate playlists for different faculties.",
    impact: [
      "Automated playlist rotation across 18 guilds",
      "Study sessions grew by 32% after telemetry-driven scheduling",
      "Support tickets resolved within 4 hours via the priority desk",
    ],
  },
  {
    title: "CreatorWorks Studio",
    industry: "Content Creator Community",
    summary:
      "Central hub for streamers needed multi-source redundancy and data exports for brand partners while staying compliant with GDPR.",
    impact: ["Generated weekly stream-ready reports for brand meetings", "Onboarded 5 regional moderators with permission templates", "Achieved 99.96% uptime over 90 days"],
  },
]

export default async function SuccessStoriesPage() {
  const metrics = await fetchHomeMetrics()
  const serverCountDisplay = formatCountWithPlus(metrics?.totals.serverCount)
  const streamsDisplay = formatCountWithPlus(metrics?.totals.totalStreams)
  const totalViewsDisplay = formatCountWithPlus(metrics?.totals.totalViews)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-16 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-16 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-30" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Success Stories</p>
          <h1 className="text-4xl md:text-5xl font-bold">Communities growing with VectoBeat</h1>
          <p className="text-foreground/70 text-lg">
            Trusted by {serverCountDisplay} servers reporting {streamsDisplay} tracked streams and {totalViewsDisplay} content touchpoints.
          </p>
        </div>
      </section>

      <section className="w-full py-16 px-4">
        <div className="max-w-5xl mx-auto space-y-8">
          {stories.map((story) => (
            <div key={story.title} className="rounded-3xl border border-border/50 bg-card/40 p-6 md:p-8 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-foreground/50">{story.industry}</p>
                  <h2 className="text-2xl font-bold">{story.title}</h2>
                </div>
                <div className="text-sm text-primary font-semibold">Live on VectoBeat</div>
              </div>
              <p className="text-foreground/70 text-base leading-relaxed">{story.summary}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {story.impact.map((impact) => (
                  <div key={impact} className="rounded-2xl border border-border/40 bg-background/60 p-4 text-sm text-foreground/80">
                    {impact}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full py-16 px-4 bg-card/30 border-t border-border">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Tell your story next</h2>
          <p className="text-foreground/70">
            Whether you’re launching a new creative collective or scaling a verified Discord, we’ll help you design a rollout plan,
            integrate telemetry, and automate support through the new desk.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/support-desk" className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
              Talk to support
            </Link>
            <Link href="/pricing" className="px-6 py-3 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/5 transition-colors">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
