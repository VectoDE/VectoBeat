import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import { Users, Zap, Shield, GitBranch, Code2, Award } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { fetchHomeMetrics } from "@/lib/fetch-home-metrics"
import { formatCountWithPlus } from "@/lib/format-number"
import { buildPageMetadata } from "@/lib/seo"

export const metadata = buildPageMetadata({
  title: "About VectoBeat | Mission, Reliability, and Community",
  description:
    "Discover how VectoBeat delivers premium Discord audio, automation, and analytics with a reliability-first engineering approach and an active community.",
  path: "/about",
  keywords: ["about vectobeat", "discord music bot team", "discord analytics", "discord automation"],
})

export default async function AboutPage() {
  const metrics = await fetchHomeMetrics()
  const serverCountDisplay = formatCountWithPlus(metrics?.totals.serverCount)
  const userCountDisplay = formatCountWithPlus(metrics?.totals.activeUsers)
  const totalViewsDisplay = formatCountWithPlus(metrics?.totals.totalViews)
  const streamsDisplay = formatCountWithPlus(metrics?.totals.totalStreams)
  const uptimeValue = metrics?.totals.uptimeLabel ?? "0%"
  const responseTimeValue = metrics?.totals.responseTimeMs
  const avgResponse =
    typeof responseTimeValue === "number" && Number.isFinite(responseTimeValue)
      ? `${Math.max(Math.round(responseTimeValue), 0)}ms`
      : "0ms"

  const values = [
    {
      icon: Zap,
      title: "Performance First",
      description: `Lightning-fast audio streaming with ${avgResponse} latency, powered by Lavalink v4 and live telemetry.`,
    },
    {
      icon: Shield,
      title: "Reliability & Security",
      description:
        "End-to-end encrypted connections, no data logging, and full compliance with Discord&rsquo;s terms of service.",
    },
    {
      icon: Code2,
      title: "Open Development",
      description:
        "Open-source codebase on GitHub. Community-driven development with transparent roadmap and feature requests.",
    },
    {
      icon: Award,
      title: "Production Ready",
      description: `${uptimeValue} uptime telemetry, comprehensive monitoring, and professional-grade infrastructure support.`,
    },
    {
      icon: Users,
      title: "Community Focused",
      description: `Built by developers, for developers. Active Discord community with ${serverCountDisplay} servers and ${userCountDisplay} daily listeners.`,
    },
    {
      icon: GitBranch,
      title: "Constantly Evolving",
      description: "Regular updates with new features, improvements, and optimizations based on community feedback.",
    },
  ]

  const team = [
    {
      role: "Lead Developer",
      name: "VectoDE",
      bio: "Passionate about building production-grade Discord bots with exceptional performance.",
    },
    {
      role: "Architecture",
      name: "Lavalink Community",
      bio: "Leveraging the power of Lavalink v4 for world-class audio streaming capabilities.",
    },
  ]

  const techStack = [
    {
      name: "Next.js 16 + React 19",
      desc: "App Router UI with streaming SSR, server components, and real-time dashboards for the control panel.",
    },
    {
      name: "TypeScript 5 & Zod",
      desc: "End-to-end type safety for API routes, plan enforcement, Discord bridges, and runtime validation.",
    },
    {
      name: "Tailwind CSS + Radix UI",
      desc: "Accessible design system powering every modal, dropdown, tooltip, and responsive control surface.",
    },
    {
      name: "React Hook Form & RHF Resolvers",
      desc: "High-signal account settings, security flows, and concierge forms with instant schema feedback.",
    },
    {
      name: "Three.js + React Three Fiber",
      desc: "Hero visuals and animated scenes rendered on the GPU without blocking the rest of the app.",
    },
    {
      name: "Prisma ORM + MySQL 8",
      desc: "Normalized storage for account data, plan entitlements, audit logs, and regional residency controls.",
    },
    {
      name: "Redis Durable Queue Store",
      desc: "In-memory cache with TTL/eviction backing queue sync, analytics, and cross-worker socket broadcasts.",
    },
    {
      name: "Python 3.11 + discord.py",
      desc: "Auto-sharded bot runtime for slash commands, concierge automations, and governance tooling.",
    },
    {
      name: "Lavalink v4 + yt-dlp",
      desc: "Lossless audio transport with multi-source resolution, crossfade, and resilient reconnects.",
    },
    {
      name: "Socket.IO Bridges",
      desc: "Low-latency pipes between the bot, durable queue store, and Next.js APIs for telemetry streaming.",
    },
    {
      name: "Stripe Billing + Webhooks",
      desc: "Subscription management, invoices, and customer portal flows secured with signed webhooks.",
    },
    {
      name: "Docker Compose + GitHub Actions",
      desc: "Parity between local, staging, and production plus automated tests, scans, and documentation guards.",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">About VectoBeat</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            VectoBeat is the Discord music layer trusted by {serverCountDisplay} active servers with {userCountDisplay} daily
            listeners. Every capability you see on this site reflects real telemetry captured from the bot in production.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <h2 className="text-4xl font-bold mb-6">Our Mission</h2>
              <p className="text-lg text-foreground/70 mb-4 leading-relaxed">
                VectoBeat was created with a simple but ambitious goal: to deliver the most reliable, feature-rich, and
                performant music bot for Discord communities worldwide. Today that vision powers roughly {serverCountDisplay} servers
                and {userCountDisplay} daily listeners—numbers pulled directly from the live telemetry that powers vectobeat.uplytech.de.
              </p>
              <p className="text-lg text-foreground/70 mb-4 leading-relaxed">
                Built on Lavalink v4 with meticulous attention to code quality, observability, and user experience,
                VectoBeat combines professional-grade infrastructure with an intuitive interface that serves communities
                of all sizes.
              </p>
              <p className="text-lg text-foreground/70 leading-relaxed">
                We believe that every Discord community deserves access to a music bot that doesn&rsquo;t compromise on
                performance, reliability, or features.
              </p>
            </div>
            <div className="relative h-96 rounded-xl overflow-hidden border border-border/50 bg-card/30">
              <Image
                src="/discord-music-bot-dashboard-with-vectobeat-interfa.jpg"
                alt="VectoBeat Control Panel"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={false}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Extended Story Section */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12">The VectoBeat Story</h2>

          <div className="space-y-6 text-lg text-foreground/70 leading-relaxed">
            <p>
              VectoBeat was born from a simple observation: Discord music bots existed, but they didn&rsquo;t feel
              production-ready. They lagged, they crashed, they lacked transparency. We believed communities deserved
              better.
            </p>
            <p>
              What started as a passion project by a small team of developers has evolved into a comprehensive platform
              used across roughly {serverCountDisplay} Discord communities. We didn&rsquo;t just build a music bot—we built an ecosystem that
              prioritizes reliability, performance, and user experience.
            </p>
            <p>
              Every feature was crafted with a specific purpose. The Lavalink v4 integration wasn&rsquo;t chosen randomly—we
              spent months evaluating audio streaming solutions. Our analytics dashboard emerged from listening to what
              server admins actually needed. Our support team is always available because we remember what it was like
              to feel abandoned by a bot.
            </p>
            <p>
              Today, VectoBeat powers music for gaming tournaments, study sessions, creator networks, and casual
              hangouts. We&rsquo;re proud that {userCountDisplay} listeners experience music through our platform every day.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Our Values</h2>
            <p className="text-xl text-foreground/70">What drives our development and commitment to excellence</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value, i) => {
              const IconComponent = value.icon
              return (
                <div
                  key={i}
                  className="p-8 rounded-lg border border-border/50 bg-background/50 hover:bg-background/80 transition-colors"
                >
                  <div className="mb-4 inline-flex p-3 bg-primary/10 rounded-lg">
                    <IconComponent size={24} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
                  <p className="text-foreground/70">{value.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Team</h2>
            <p className="text-xl text-foreground/70">Passionate developers dedicated to audio excellence</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {team.map((member, i) => (
              <div key={i} className="p-8 rounded-lg border border-border/50 bg-card/50">
                <p className="text-sm font-semibold text-primary mb-2">{member.role}</p>
                <h3 className="text-2xl font-bold mb-3">{member.name}</h3>
                <p className="text-foreground/70">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Technology Stack</h2>
            <p className="text-xl text-foreground/70">Built with industry-leading tools and frameworks</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {techStack.map((tech) => (
              <div key={tech.name} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold mb-2">{tech.name}</h3>
                <p className="text-sm text-foreground/70">{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Awards & Recognition */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Recognition & Impact</h2>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { title: "Active Servers", subtitle: serverCountDisplay, detail: "Live telemetry reported by the bot" },
              { title: "Daily Listeners", subtitle: userCountDisplay, detail: "Current audience reach" },
              { title: "Blog Reach", subtitle: totalViewsDisplay, detail: "All-time article views" },
              { title: "Streams Processed", subtitle: streamsDisplay, detail: "Playback events captured" },
            ].map((award, i) => (
              <div key={i} className="p-6 rounded-lg border border-primary/30 bg-primary/5 text-center">
                <p className="text-sm font-semibold text-primary uppercase mb-2">{award.subtitle}</p>
                <h3 className="text-xl font-bold mb-2">{award.title}</h3>
                <p className="text-foreground/60">{award.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Join Our Community</h2>
          <p className="text-xl text-foreground/70 mb-8">Experience the difference of professional music streaming</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={DISCORD_BOT_INVITE_URL}
              className="inline-flex items-center justify-center px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Add VectoBeat to Discord
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/10 transition-colors"
            >
              View Premium Plans
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
