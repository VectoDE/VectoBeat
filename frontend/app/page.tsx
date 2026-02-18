export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import Script from "next/script"
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
    "24/7 discord radio",
    "discord playback automation",
    "discord bot observability",
    "discord music analytics",
  ],
  image: {
    url: "/logo.png",
    width: 1200,
    height: 630,
    alt: "VectoBeat Discord music bot dashboard preview",
  },
})

type FaqItem = {
  question: string
  answer?: string
  template?: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is there still a free tier?",
    answer:
      "Yes. The Free plan ships with the Discord bot, essential music sources, and community support. Paid tiers unlock premium routing, automation, billing exports, and concierge onboarding.",
  },
  {
    question: "How fast does VectoBeat respond?",
    template:
      "Live telemetry averages {{latency}} command times thanks to our EU-hosted Lavalink v4 cluster, redundant routing, and automatic failover.",
  },
  {
    question: "Can I change or cancel my plan anytime?",
    answer:
      "Absolutely. Upgrades apply instantly, downgrades take effect at the end of the billing cycle, and you can cancel without penalties from the Control Panel.",
  },
  {
    question: "Which payment methods and currency do you support?",
    answer:
      "All pricing is denominated in EUR (€). Stripe processes major credit and debit cards, SEPA Direct Debit, Apple Pay, and Google Pay. Enterprise invoices can be settled via bank transfer.",
  },
  {
    question: "How do I get help if something breaks?",
    answer:
      "Start with the Support Desk live chat for real-time ticketing, or email timhauke@uplytech.de for escalations. Paid tiers include guaranteed response windows and proactive incident alerts.",
  },
  {
    question: "What do you log about our community?",
    answer:
      "Only aggregated analytics—page views, install counts, and plan status—are stored with hashed IPs and full GDPR controls. You can export or delete data from the Account → Privacy tab anytime.",
  },
  {
    question: "Is there API or webhook access?",
    answer:
      "Starter and higher tiers receive REST + webhook access for automation, event notifications, and billing callbacks. SDKs include examples for Node.js and Python.",
  },
]

export default async function Home() {
  const metrics = await fetchHomeMetrics()
  const filteredStats =
    metrics && Array.isArray(metrics.stats)
      ? metrics.stats.filter((stat) => stat.label !== "Commands Executed" && stat.label !== "Streams Processed")
      : []
  const filteredMetrics = metrics ? { ...metrics, stats: filteredStats } : null

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

  const serverCountValue = typeof metrics?.totals.serverCount === "number" ? metrics.totals.serverCount : 0
  const activeListenersValue = typeof metrics?.totals.activeUsers === "number" ? metrics.totals.activeUsers : 0
  const totalStreamsValue = typeof metrics?.totals.totalStreams === "number" ? metrics.totals.totalStreams : 0

  const resolvedFaqs = FAQ_ITEMS.map((item) => ({
    question: item.question,
    answer: item.template ? render(item.template) : item.answer ?? "",
  }))

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "VectoBeat",
      url: "https://vectobeat.uplytech.de/",
      logo: "https://vectobeat.uplytech.de/logo.png",
      sameAs: [
        "https://twitter.com/vectobeat",
        "https://github.com/VectoDE/VectoBeat",
        "https://discord.gg/vectobeat",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      url: "https://vectobeat.uplytech.de/",
      name: "VectoBeat Discord Music Bot",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://vectobeat.uplytech.de/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "VectoBeat Discord Music Bot",
      operatingSystem: "Discord",
      applicationCategory: "MultimediaApplication",
      audience: {
        "@type": "Audience",
        audienceType: "Discord communities, creators, education servers",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        url: "https://vectobeat.uplytech.de/pricing",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: Math.max(serverCountValue || 0, 120),
      },
      interactionStatistic: [
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/ListenAction",
          userInteractionCount: totalStreamsValue || 0,
        },
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/InstallAction",
          userInteractionCount: activeListenersValue || 0,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: resolvedFaqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ]


  return (
    <>
      <Script id="vectobeat-home-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(structuredData)}
      </Script>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <Navigation />
        <main>

        <section
          className="relative w-full pt-34 pb-20 px-4 overflow-hidden"
          aria-labelledby="vectobeat-hero-heading"
        >
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

            <h1
              id="vectobeat-hero-heading"
              className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-balance animate-fade-in-up"
            >
              VectoBeat: Enterprise Discord music bot for hi-fi streaming &amp; automation
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

        <section
          className="sr-only"
          aria-labelledby="search-visibility-heading"
        >
          <div className="max-w-5xl mx-auto space-y-6">
            <h2 id="search-visibility-heading" className="text-3xl font-bold">
              What makes VectoBeat the best Discord music bot?
            </h2>
            <p className="text-foreground/70 text-lg">
              VectoBeat fuses a hi-fi Discord music bot with a self-service control panel, automation playbooks, and proactive
              analytics. The stack uses Lavalink v4, GDPR-safe telemetry, role-based DJ permissions, and 24/7 incident monitoring so
              your community broadcasts premium audio with confidence. Whether you run a gaming guild, esports league, or creator
              network, the bot stays compliant, monetization-ready, and lightning fast.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <article className="space-y-3">
                <h3 className="text-xl font-semibold">Use cases we optimise for</h3>
                <ul className="space-y-2 text-foreground/70">
                  <li>
                    <strong className="text-foreground">Creator lounges:</strong> Branded mixes, smart rotation, and Discord Stage
                    support for VIP releases and town halls.
                  </li>
                  <li>
                    <strong className="text-foreground">Gaming communities:</strong> Queue enforcement, request limits, and incident
                    intelligence keep raids, scrims, and tournaments focussed.
                  </li>
                  <li>
                    <strong className="text-foreground">Education hubs:</strong> Copyright-safe playlists, lecture recordings, and
                    analytics exports for compliance and alumni engagement.
                  </li>
                </ul>
              </article>
              <article className="space-y-3">
                <h3 className="text-xl font-semibold">Search visibility highlights</h3>
                <ul className="space-y-2 text-foreground/70">
                  <li>
                    99.9% uptime tracked in real time with public {render("{{uptime}} uptime feed.")} View our{" "}
                    <Link href="/stats" className="text-primary underline">
                      live status dashboard
                    </Link>{" "}
                    any time.
                  </li>
                  <li>
                    Dedicated landing pages for{" "}
                    <Link href="/features" className="text-primary underline">
                      features
                    </Link>
                    ,{" "}
                    <Link href="/pricing" className="text-primary underline">
                      pricing
                    </Link>{" "}
                    and{" "}
                    <Link href="/support-desk" className="text-primary underline">
                      support
                    </Link>{" "}
                    help search engines map every VectoBeat topic.
                  </li>
                  <li>
                    Transparent roadmap and{" "}
                    <Link href="/forum" className="text-primary underline">
                      community forum
                    </Link>{" "}
                    packed with tutorials, customer stories, and release announcements.
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="w-full py-12 px-4 border-y border-border">
          <div className="max-w-6xl mx-auto mb-6">
            <h2 className="text-2xl font-semibold">Live telemetry overview</h2>
            <p className="text-sm text-foreground/60">Real dashboards sourced directly from the production bot.</p>
          </div>
          {filteredMetrics ? (
            <HomeMetricsPanel initialMetrics={filteredMetrics} />
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
              {resolvedFaqs.map((item) => (
                <details
                  key={item.question}
                  className="group border border-border/50 rounded-lg p-4 hover:border-primary/30 transition-all duration-300 cursor-pointer"
                >
                  <summary className="font-semibold flex justify-between items-center">
                    {item.question}
                    <span className="text-primary group-open:rotate-180 transition-transform">▶</span>
                  </summary>
                  <p className="text-foreground/70 mt-4">{item.answer}</p>
                </details>
              ))}
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

        </main>
        <Footer />
      </div>
    </>
  )
}
