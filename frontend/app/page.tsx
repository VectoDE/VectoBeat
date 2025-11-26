export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import DiscordWidget from "@/components/discord-widget"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import { HomeMetricsPanel } from "@/components/home-metrics"
import { fetchHomeMetrics } from "@/lib/fetch-home-metrics"
import { formatCountWithPlus } from "@/lib/format-number"
import { Music, Zap, Radio, BarChart3, Users, Shield, AlertCircle, TrendingUp, GitBranch, Clock, Lock } from "lucide-react"
import { HomePlanCarousel } from "@/components/home-plan-carousel"
import { buildPageMetadata } from "@/lib/seo"

const formatTemplate = (template?: string, vars: Record<string, string | number> = {}) => {
  if (!template) return ""
  return Object.entries(vars).reduce(
    (text, [token, value]) => text.replaceAll(`{{${token}}}`, String(value)),
    template,
  )
}

const formatMetricValue = (
  metrics: Awaited<ReturnType<typeof fetchHomeMetrics>>,
  metricKey: string,
  computed: Record<string, string>,
) => {
  if (!metrics) {
    return computed[metricKey] ?? "0"
  }

  switch (metricKey) {
    case "responseTimeMs":
      return computed.latency ?? "0ms"
    case "serverCount":
    case "activeUsers":
    case "totalStreams":
      return computed[metricKey] ?? "0"
    case "totalViews":
      return formatCountWithPlus(metrics.totals.totalViews)
    default: {
      const raw = metrics.totals[metricKey as keyof typeof metrics.totals]
      if (typeof raw === "number") {
        return formatCountWithPlus(raw)
      }
      if (typeof raw === "string" && raw.trim()) {
        return raw
      }
      return computed[metricKey] ?? "0"
    }
  }
}

const HERO_WORDS = ["Playback", "Automation", "Telemetry", "Reliability", "Security"]

export const metadata = buildPageMetadata({
  title: "VectoBeat | Discord Music Bot with Premium Audio & Analytics",
  description:
    "Stream high-fidelity music on Discord with VectoBeat. Premium audio, smart automation, telemetry, and control panel insights built for growing communities.",
  path: "/",
  keywords: [
    "discord music bot",
    "premium discord bot",
    "lavalink v4",
    "discord audio streaming",
    "discord analytics",
    "discord automation",
    "vectobeat",
  ],
})

const JOURNEY_STEPS = [
  {
    title: "Discover",
    detail: "Scan guild health, detect stale queues, and preview AI playlists before rollout.",
    accent: "from-primary/70 via-primary to-primary/40",
  },
  {
    title: "Automate",
    detail: "Layer smart triggers, slotting, and predictive scaling without writing custom code.",
    accent: "from-secondary/70 via-secondary to-secondary/30",
  },
  {
    title: "Measure",
    detail: "Pipe telemetry to dashboards or exports, then enforce guardrails with a single toggle.",
    accent: "from-amber-500/70 via-orange-500/50 to-orange-400/30",
  },
]

export default async function Home() {
  const metrics = await fetchHomeMetrics()

  const serverCountDisplay = formatCountWithPlus(metrics?.totals.serverCount)
  const userCountDisplay = formatCountWithPlus(metrics?.totals.activeUsers)
  const streamsDisplay = formatCountWithPlus(metrics?.totals.totalStreams)
  const responseTimeValue = metrics?.totals.responseTimeMs
  const avgResponse =
    typeof responseTimeValue === "number" && Number.isFinite(responseTimeValue)
      ? `${Math.max(Math.round(responseTimeValue), 0)}ms`
      : "0ms"
  const uptimeValue = metrics?.totals.uptimeLabel ?? "0%"

  const templateVars = {
    servers: serverCountDisplay,
    listeners: userCountDisplay,
    streams: streamsDisplay,
    latency: avgResponse,
    uptime: uptimeValue,
    guilds: serverCountDisplay,
    serverMembers: userCountDisplay,
  }

  const render = (template?: string, extraVars: Record<string, string | number> = {}) =>
    formatTemplate(template, { ...templateVars, ...extraVars })

  const heroStats = [
    { label: "Active guilds", value: serverCountDisplay },
    { label: "Monthly listeners", value: userCountDisplay },
    { label: "Streams observed", value: streamsDisplay },
    { label: "Response SLO", value: avgResponse },
  ]


  return (
    <>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <Navigation />

        <section className="relative w-full pt-34 pb-20 px-4 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-2xl h-168 bg-primary/25 rounded-full blur-[160px] opacity-50 animate-hero-glow" />
            <div className="absolute bottom-0 left-6 w-72 h-72 bg-secondary/30 rounded-full blur-[120px] opacity-40 animate-hero-glow animation-delay-2000" />
            <div className="absolute top-16 right-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-[140px] opacity-30 animate-hero-glow animation-delay-1000" />
          </div>

          <div className="relative max-w-6xl mx-auto text-center">
            <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full animate-fade-in">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm font-medium text-primary">Live telemetry</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-balance animate-fade-in-up">
              Professional audio for every Discord community
            </h1>

            <p className="text-xl text-foreground/70 mb-6 max-w-3xl mx-auto text-pretty animate-fade-in-up animation-delay-200">
              {render(
                "Trusted by {{servers}} active servers and {{listeners}} daily listeners for lossless playback, analytics, and safety tooling.",
              )}
            </p>

            <p className="text-sm text-foreground/50 mb-12 max-w-2xl mx-auto animate-fade-in-up animation-delay-400">
              {render(
                "Service-level objective: {{uptime}} uptime with {{latency}} command latency measured in production.",
              )}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-in-up animation-delay-400">
              <a
                href={DISCORD_BOT_INVITE_URL}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-linear-to-r from-primary via-primary to-secondary text-primary-foreground rounded-lg font-semibold hover:scale-105 transition-all duration-300 transform hover:shadow-2xl hover:shadow-primary/40">
                <Music className="w-5 h-5" />
                Add to Discord
              </a>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 hover:border-primary/50 transition-all duration-300"
              >
                View pricing
                <Zap className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="w-full py-12 px-4 border-y border-border">
          <div className="max-w-6xl mx-auto mb-6">
            <h2 className="text-2xl font-semibold">Live telemetry overview</h2>
            <p className="text-sm text-foreground/60">Real dashboards sourced directly from the production bot.</p>
          </div>
          {metrics ? (
            <HomeMetricsPanel initialMetrics={metrics} />
          ) : (
            <p className="text-center text-sm text-foreground/60">
              Live metrics are temporarily unavailable. Please check back soon.
            </p>
          )}
        </section>

        <section className="w-full py-12 px-4 bg-card/20 border-y border-border">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <h2 className="text-3xl font-bold mb-4">Join the VectoBeat Community</h2>
                <p className="text-foreground/70 mb-6">
                  Connect with thousands of server admins, get support, share tips, and stay updated with the latest news about
                  VectoBeat.
                </p>
                <div className="space-y-2 text-sm text-foreground/70 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-semibold">✓</span>
                    <span>Real-time help from the core team</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-semibold">✓</span>
                    <span>Feature announcements and release updates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-semibold">✓</span>
                    <span>Tips, best practices, and setup guides</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-semibold">✓</span>
                    <span>Community events, contests, and showcases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-semibold">✓</span>
                    <span>Direct feedback channel for roadmap input</span>
                  </div>
                </div>
                <DiscordWidget />
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/10">
                  <h3 className="font-semibold text-primary mb-2">Live Operations</h3>
                  <p className="text-sm text-foreground/70">
                    Monitor latency, uptime, and stream counts in real time under vectobeat.uplytech.de/stats via live Socket.IO
                    updates.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/10">
                  <h3 className="font-semibold text-primary mb-2">Security Center</h3>
                  <p className="text-sm text-foreground/70">
                    Enforce 2FA, review sessions, and revoke access instantly inside the account security section.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Why Choose VectoBeat?</h2>
              <p className="text-xl text-foreground/70">
                Built for communities that demand reliability, performance, and advanced features. No compromises.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Lightning performance</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {render("Commands respond in {{latency}} thanks to tuned Lavalink clusters.")}
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Global community</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {render("Scaling automatically to support {{servers}} guilds without interruptions.")}
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Real-time analytics</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {render("Track {{streams}} verified playback events with privacy-first telemetry.")}
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Operational insights</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Comprehensive dashboards highlight queue health, incidents, and listener behavior in one place.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Community focused</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Collaborative queues, shared playlists, and voting tools keep every member involved.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Enterprise security</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  GDPR-compliant processing, encryption, and audit-ready controls protect your community data.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Radio className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Global scale</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Multi-region routing ensures low latency for every geography.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <AlertCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Incident ready</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Regional outage alerts, incident management, and maintenance notifications keep staff in sync.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Support Desk SLA</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Standard Care answers every ticket inside 24 hours, while Priority Care for Pro, Growth, Scale, and Enterprise runs 24/7 with under 4-hour responses.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <GitBranch className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Forum & roadmap</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Curated forum access and transparent roadmaps keep moderators ahead of releases.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Role-safe controls</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  Granular permissions ensure only trusted DJs or staff can change automation settings.
                </p>
              </div>
              <div className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all duration-300 transform hover:-translate-y-2 group">
                <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Live status intelligence</h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {render("{{uptime}} uptime feed with shard health visualizations and maintenance notifications.")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-20 px-4">
          <div className="max-w-6xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Flexible Plans for Every Community</h2>
            <p className="text-xl text-foreground/70">Start free and upgrade as you grow. Cancel anytime, no commitment.</p>
          </div>
          <div className="max-w-6xl mx-auto">
            <HomePlanCarousel />
            <div className="text-center mt-8">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all"
              >
                View all plans & details
                <Zap className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>




        <section className="w-full py-20 px-4 bg-card/30 border-y border-border overflow-x-hidden">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold mb-12 text-center">
              {render("Loved by {{servers}} server communities")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, starIndex) => (
                    <span key={starIndex} className="text-primary text-lg">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-foreground/80 mb-4 italic">
                  &ldquo;VectoBeat keeps our tournament broadcasts smooth—no lag, no downtime, and analytics that prove it.&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-primary">Esports Lead</p>
                  <p className="text-sm text-foreground/60">Weekly tournament</p>
                </div>
              </div>
              <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, starIndex) => (
                    <span key={starIndex} className="text-primary text-lg">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-foreground/80 mb-4 italic">
                  &ldquo;The live uptime telemetry gave us confidence to make VectoBeat the official music bot for our
                  organization.&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-primary">Server Owner</p>
                  <p className="text-sm text-foreground/60">{render("{{guilds}} guild network")}</p>
                </div>
              </div>
              <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, starIndex) => (
                    <span key={starIndex} className="text-primary text-lg">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-foreground/80 mb-4 italic">
                  &ldquo;Support helped us wire custom automations in days instead of weeks.&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-primary">Technical Lead</p>
                  <p className="text-sm text-foreground/60">Professional server</p>
                </div>
              </div>
              <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, starIndex) => (
                    <span key={starIndex} className="text-primary text-lg">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-foreground/80 mb-4 italic">
                  &ldquo;Setup was incredibly easy. Within minutes we had professional-grade streaming running.&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-primary">New Server Admin</p>
                  <p className="text-sm text-foreground/60">Growing community</p>
                </div>
              </div>
              <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, starIndex) => (
                    <span key={starIndex} className="text-primary text-lg">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-foreground/80 mb-4 italic">
                  &ldquo;Multi-source support means we never run out of music, and streaming is copyright-safe.&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-primary">Content Creator</p>
                  <p className="text-sm text-foreground/60">{render("{{streams}} streams logged")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="w-full py-20 px-4 bg-card/30 border-y border-border overflow-x-hidden">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold mb-12 text-center">Performance Metrics That Matter</h2>
            {metrics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 rounded-lg border border-border/50 hover:border-primary/30 text-center transition-all duration-300">
                  <div className="flex justify-center mb-4">
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {formatMetricValue(metrics, "responseTimeMs", { latency: avgResponse })}
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Response time</h3>
                  <p className="text-foreground/60 text-sm">Latency reported directly from bot telemetry.</p>
                </div>
                <div className="p-6 rounded-lg border border-border/50 hover:border-primary/30 text-center transition-all duration-300">
                  <div className="flex justify-center mb-4">
                    <TrendingUp className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {formatMetricValue(metrics, "serverCount", { serverCount: serverCountDisplay })}
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Active servers</h3>
                  <p className="text-foreground/60 text-sm">Live count sourced from the production bot.</p>
                </div>
                <div className="p-6 rounded-lg border border-border/50 hover:border-primary/30 text-center transition-all duration-300">
                  <div className="flex justify-center mb-4">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {formatMetricValue(metrics, "activeUsers", { activeUsers: userCountDisplay })}
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Active listeners</h3>
                  <p className="text-foreground/60 text-sm">Real listeners measured through telemetry.</p>
                </div>
                <div className="p-6 rounded-lg border border-border/50 hover:border-primary/30 text-center transition-all duration-300">
                  <div className="flex justify-center mb-4">
                    <Shield className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {formatMetricValue(metrics, "totalViews", {})}
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Site views</h3>
                  <p className="text-foreground/60 text-sm">Aggregated blog analytics.</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-foreground/60">
                Live metrics are temporarily unavailable. Please check back soon.
              </p>
            )}
          </div>
        </section>

        <section className="w-full py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold mb-12 text-center">Built on Proven Technology</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <h3 className="text-2xl font-bold mb-6">Core Infrastructure</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Lavalink v4 – enterprise audio streaming</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Python &amp; discord.py – battle-tested framework</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Redis – high-performance caching with persistence</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Pydantic – type-safe configuration management</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">PostgreSQL – reliable storage with ACID compliance</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Docker &amp; Kubernetes – cloud-native scaling</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-6">Advanced Capabilities</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Adaptive audio quality with live progress tracking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Queue autosyncing with real-time updates</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Intelligent search across every supported music source</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Comprehensive metrics and observability tooling</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Machine learning-based recommendations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary mt-1 font-bold">✓</span>
                    <span className="text-foreground/80">Advanced permission system with RBAC</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-20 px-4 bg-card/30 border-y border-border overflow-x-hidden">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold mb-12 text-center">Get Started in Minutes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
              <div className="relative text-center px-2">
                <div className="mb-4 mx-auto w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                  1
                </div>
                <div className="flex justify-center mb-3">
                  <Music className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-2">Add Bot</h3>
                <p className="text-foreground/60 text-xs md:text-sm mb-2">One-click OAuth integration with Discord.</p>
                <p className="text-xs text-primary font-semibold">30s</p>
                <div className="hidden lg:block absolute top-8 left-[60%] w-[calc(40%-12px)] h-0.5 bg-linear-to-r from-primary/50 to-transparent" />
              </div>
              <div className="relative text-center px-2">
                <div className="mb-4 mx-auto w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                  2
                </div>
                <div className="flex justify-center mb-3">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-2">Permissions</h3>
                <p className="text-foreground/60 text-xs md:text-sm mb-2">Automatic permission setup and validation.</p>
                <p className="text-xs text-primary font-semibold">30s</p>
                <div className="hidden lg:block absolute top-8 left-[60%] w-[calc(40%-12px)] h-0.5 bg-linear-to-r from-primary/50 to-transparent" />
              </div>
              <div className="relative text-center px-2">
                <div className="mb-4 mx-auto w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                  3
                </div>
                <div className="flex justify-center mb-3">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-2">Configure</h3>
                <p className="text-foreground/60 text-xs md:text-sm mb-2">Customize settings for your server needs.</p>
                <p className="text-xs text-primary font-semibold">2 min</p>
                <div className="hidden lg:block absolute top-8 left-[60%] w-[calc(40%-12px)] h-0.5 bg-linear-to-r from-primary/50 to-transparent" />
              </div>
              <div className="relative text-center px-2">
                <div className="mb-4 mx-auto w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                  4
                </div>
                <div className="flex justify-center mb-3">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-2">Play</h3>
                <p className="text-foreground/60 text-xs md:text-sm mb-2">Start enjoying music instantly with commands.</p>
                <p className="text-xs text-primary font-semibold">Immediate</p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold mb-12 text-center">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  Is there still a free tier?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  Yes. The Free plan includes the Discord bot, essential music sources, and community support. Paid tiers unlock
                  premium routing, automation, and billing features.
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  How fast does VectoBeat respond?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  {render(
                    "Live telemetry averages {{latency}} command times thanks to our EU-hosted Lavalink v4 cluster and automatic failover.",
                  )}
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  Can I change or cancel my plan anytime?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  Absolutely. Upgrades apply instantly, downgrades take effect at the end of the billing cycle, and you can cancel
                  without penalties inside the Control Panel.
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  Which payment methods and currency do you support?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  All pricing is denominated in EUR (€). Stripe processes major credit and debit cards, SEPA direct debit, Apple
                  Pay, and Google Pay. Enterprise invoices can be paid via bank transfer.
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  How do I get help if something breaks?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  Start with the Support Desk chat for real-time ticketing, or email timhauke@uplytech.de for escalations. Paid
                  tiers include guaranteed response windows and proactive incident alerts.
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  What do you log about our community?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  Only aggregated analytics (page views, install counts, plan status) are stored with hashed IPs and full GDPR
                  controls. You can export or delete your data from the Account → Privacy tab anytime.
                </p>
              </details>
              <details className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                <summary className="font-semibold flex justify-between items-center">
                  Is there an API or webhook access?
                  <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                </summary>
                <p className="text-foreground/70 mt-4">
                  Starter and higher tiers receive REST + Webhook access for automation, event notifications, and billing
                  callbacks. SDKs ship with examples for Node.js and Python.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="w-full py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up">
              Ready to bring professional music automation to your Discord?
            </h2>
            <p className="text-xl text-foreground/70 mb-8 animate-fade-in-up animation-delay-200">
              {render("Join {{servers}} communities already streaming with VectoBeat every day.")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <a
                href={DISCORD_BOT_INVITE_URL}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 hover:scale-105 transition-all duration-300 transform hover:shadow-lg hover:shadow-primary/50"
              >
                <Music className="w-5 h-5" />
                Add to Discord
              </a>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 hover:border-primary/50 transition-all duration-300"
              >
                Compare pricing
                <Zap className="w-5 h-5" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 hover:border-primary/50 transition-all duration-300"
              >
                Explore features
                <Zap className="w-5 h-5" />
              </Link>
            </div>
            <p className="text-foreground/60 text-sm">No setup fees. Cancel anytime inside the Control Panel.</p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  )
}
