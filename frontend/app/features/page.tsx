export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import {
  Settings,
  Volume2,
  Radio,
  Share2,
  AudioWaveform as Waveform2,
  Layers,
  Shield,
  GitBranch,
  Gauge,
  Check,
  X,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { buildPageMetadata } from "@/lib/seo"

export const metadata = buildPageMetadata({
  title: "Features | VectoBeat Discord Music Bot & Automation",
  description:
    "Explore VectoBeat capabilities: premium audio streaming, smart queue automation, telemetry, analytics, and secure control panel for Discord servers.",
  path: "/features",
  keywords: ["vectobeat features", "discord bot features", "discord automation", "discord analytics", "lavalink v4"],
})
import { fetchHomeMetrics } from "@/lib/fetch-home-metrics"
import { formatCountWithPlus } from "@/lib/format-number"
import { getBotCommands } from "@/lib/commands"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"

const formatTemplate = (template?: string, vars: Record<string, string | number> = {}) => {
  if (!template) return ""
  return Object.entries(vars).reduce(
    (text, [token, value]) => text.replaceAll(`{{${token}}}`, String(value)),
    template,
  )
}

export default async function FeaturesPage() {
  const metrics = await fetchHomeMetrics()
  const botCommands = await getBotCommands()

  const serverCountDisplay = formatCountWithPlus(metrics?.totals.serverCount)
  const userCountDisplay = formatCountWithPlus(metrics?.totals.activeUsers)
  const streamsDisplay = formatCountWithPlus(metrics?.totals.totalStreams)
  const uptimeValue = metrics?.totals.uptimeLabel ?? "0%"
  const responseTimeValue = metrics?.totals.responseTimeMs
  const avgResponse =
    typeof responseTimeValue === "number" && Number.isFinite(responseTimeValue)
      ? `${Math.max(Math.round(responseTimeValue), 0)}ms`
      : "0ms"
  const commandsCount = botCommands.length

  const templateVars = {
    servers: serverCountDisplay,
    listeners: userCountDisplay,
    streams: streamsDisplay,
    uptime: uptimeValue,
    latency: avgResponse,
    commands: commandsCount,
  }

  const render = (template?: string, extraVars?: Record<string, string | number>) =>
    formatTemplate(template, { ...templateVars, ...extraVars })

  const comparisonColumns = [
    { tier: "free", label: MEMBERSHIP_TIERS.free.name },
    { tier: "starter", label: MEMBERSHIP_TIERS.starter.name },
    { tier: "pro", label: MEMBERSHIP_TIERS.pro.name },
    { tier: "growth", label: MEMBERSHIP_TIERS.growth.name },
    { tier: "scale", label: MEMBERSHIP_TIERS.scale.name },
    { tier: "enterprise", label: MEMBERSHIP_TIERS.enterprise.name },
  ] as const

  const formatCommandCount = (count: number) =>
    render(count === 1 ? "{{count}} command" : "{{count}} commands", { count })
  const displayCommandName = (name: string) => name.replace(/^\/+/, "")

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="w-full pt-32 pb-20 px-4 border-b border-border bg-card/20" data-animate-on-scroll="off">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Every feature is built for production</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            From hi-fi playback to incident response, VectoBeat ships the tooling serious communities rely on.
          </p>
        </div>
      </section>

      <section className="w-full py-12 px-4 border-b border-border bg-card/5" data-animate-on-scroll="off">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          <div className="p-5 rounded-2xl border border-border/40 bg-background/70">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Observability</p>
            <h3 className="text-xl font-semibold mb-2">{render("{{uptime}} uptime SLO")}</h3>
            <p className="text-sm text-foreground/70">Live dashboards for every region with automated incident workflows.</p>
          </div>
          <div className="p-5 rounded-2xl border border-border/40 bg-background/70">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Automation</p>
            <h3 className="text-xl font-semibold mb-2">Queue logic you control</h3>
            <p className="text-sm text-foreground/70">Schedule drops, sync playlists, and script slash commands with telemetry hooks.</p>
          </div>
          <div className="p-5 rounded-2xl border border-border/40 bg-background/70">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Security</p>
            <h3 className="text-xl font-semibold mb-2">Enterprise-grade isolation</h3>
            <p className="text-sm text-foreground/70">Scoped OAuth, per-route rate limiting, and audit-ready logs across EU / US / APAC.</p>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4" data-animate-on-scroll="off">
        <div className="max-w-6xl mx-auto space-y-20">
          <div className="space-y-8">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">01</p>
              <h2 className="text-3xl font-bold mt-2 mb-3">Audio experience</h2>
              <p className="text-foreground/70">Hi-fi playback with intelligent failover so your sound never cracks.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Waveform2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Hi-fi presets</h3>
                </div>
                <p className="text-sm text-foreground/70">Choose FLAC, AAC, or Opus with adaptive buffering.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Smart leveling</h3>
                </div>
                <p className="text-sm text-foreground/70">Normalize volume across every source automatically.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Radio className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Multi-source routing</h3>
                </div>
                <p className="text-sm text-foreground/70">Fallback between YouTube, Spotify, and SoundCloud instantly.</p>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">02</p>
              <h2 className="text-3xl font-bold mt-2 mb-3">Reliability &amp; automation</h2>
              <p className="text-foreground/70">Operators get the tooling they need to run broadcasts like a production studio.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Playbook builder</h3>
                </div>
                <p className="text-sm text-foreground/70">Trigger commands based on roles, schedules, or webhooks.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Shard orchestration</h3>
                </div>
                <p className="text-sm text-foreground/70">Scale across clusters with Redis-backed queue mirroring.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Gauge className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Telemetry budgets</h3>
                </div>
                <p className="text-sm text-foreground/70">Set latency budgets and get paged when shards drift.</p>
              </div>
            </div>
          </div>

  <div className="space-y-8">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">03</p>
              <h2 className="text-3xl font-bold mt-2 mb-3">Security &amp; collaboration</h2>
              <p className="text-foreground/70">Granular access controls with the context your team needs to move fast.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Scoped roles</h3>
                </div>
                <p className="text-sm text-foreground/70">Per-command permissions with audit logs and session tracing.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Shared playlists</h3>
                </div>
                <p className="text-sm text-foreground/70">Crowdsource queues with voting, veto, and tiered limits.</p>
              </div>
              <div className="p-6 rounded-2xl border border-border/40 bg-card/40">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Developer hooks</h3>
                </div>
                <p className="text-sm text-foreground/70">Typed webhooks and REST APIs for custom dashboards.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border" data-animate-on-scroll="off">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Plan comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-border/40 bg-background/80">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-foreground/70">Feature</th>
                  {comparisonColumns.map((column) => (
                    <th key={column.tier} className="px-6 py-4 text-center font-semibold text-foreground/70">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    feature: "Music sources",
                    tiers: {
                      free: "5 sources",
                      starter: "15 sources",
                      pro: "Unlimited",
                      growth: "Unlimited",
                      scale: "Unlimited",
                      enterprise: "Unlimited",
                    },
                  },
                  {
                    feature: "Queue length",
                    tiers: {
                      free: "100 tracks",
                      starter: "Unlimited",
                      pro: "Unlimited",
                      growth: "Unlimited",
                      scale: "Unlimited",
                      enterprise: "Unlimited",
                    },
                  },
                  {
                    feature: "Automation engine",
                    tiers: { free: false, starter: false, pro: true, growth: true, scale: true, enterprise: true },
                  },
                  {
                    feature: "Custom prefix & branding",
                    tiers: { free: false, starter: true, pro: true, growth: true, scale: true, enterprise: true },
                  },
                  {
                    feature: "Priority Care (<4h 24/7)",
                    tiers: { free: false, starter: false, pro: true, growth: true, scale: true, enterprise: true },
                  },
                  {
                    feature: "White-label options",
                    tiers: { free: false, starter: false, pro: false, growth: false, scale: true, enterprise: true },
                  },
                ].map((row, idx) => (
                  <tr key={`${row.feature}-${idx}`} className="border-t border-border/30">
                    <td className="px-6 py-4 font-medium text-foreground">{row.feature}</td>
                    {comparisonColumns.map((column) => {
                      const value = row.tiers[column.tier as keyof typeof row.tiers] ?? false
                      if (typeof value === "boolean") {
                        return (
                          <td key={column.tier} className="px-6 py-4 text-center">
                            {value ? <Check className="w-5 h-5 text-primary mx-auto" /> : <X className="w-5 h-5 text-border mx-auto" />}
                          </td>
                        )
                      }
                      return (
                        <td key={column.tier} className="px-6 py-4 text-center text-foreground/70">
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4" data-animate-on-scroll="off">
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-[1.2fr_0.8fr] items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-3">Community Forum</p>
            <h2 className="text-4xl font-bold mb-4">A home for operators &amp; creators</h2>
            <p className="text-foreground/70 text-lg leading-relaxed">
              We are rolling out a dedicated forum where you can audit releases, swap automation recipes, and talk directly with
              the VectoBeat team. Pro+ customers get early access.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
              <Link
                href="/roadmap"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                View the roadmap
              </Link>
              <Link
                href="/support-desk"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/5 transition-colors"
              >
                Join waitlist
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/70 p-6 space-y-3 text-sm text-foreground/70">
            <p className="font-semibold text-foreground">Community Forum</p>
            <ul className="space-y-2">
              {[
                "Private alpha (April): invite-only threads with moderator cohort.",
                "Public beta (early summer): read access for all, curated showcases.",
                "Stability phase: Support Desk integration plus stats exports.",
              ].map((item, index) => (
                <li key={`${item}-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border" data-animate-on-scroll="off">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12">Command Reference</h2>
          {botCommands.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {botCommands.map((group) => (
                <div key={group.category} className="p-6 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{group.category}</h3>
                    <span className="text-xs text-foreground/50">{formatCommandCount(group.commands.length)}</span>
                  </div>
                  <div className="space-y-3">
                    {group.commands.map((command) => (
                      <div key={command.name} className="border-b border-border/30 pb-3 last:border-b-0">
                        <code className="text-sm text-primary font-mono">/{displayCommandName(command.name)}</code>
                        <p className="text-foreground/70 text-sm mt-1">
                          {command.description?.trim() || "No description provided by the bot."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-8 text-center text-sm text-foreground/70">
              <p className="mb-2 font-semibold text-foreground">Commands not available at the moment</p>
              <p className="text-foreground/70">
                The VectoBeat bot has not published its catalog yet. Ensure it is online or check the diagnostics endpoint for more
                details.{" "}
                <Link href="/api/commands" className="text-primary hover:underline">
                  /api/commands
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="w-full py-20 px-4" data-animate-on-scroll="off">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Experience the entire feature set today</h2>
          <p className="text-xl text-foreground/70 mb-8">
            Add VectoBeat to your Discord server and unlock telemetry-driven music automation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={DISCORD_BOT_INVITE_URL}
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 hover:scale-105 transition-all duration-300"
            >
              Add to Discord
              <ArrowRight size={20} />
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 transition-all duration-300"
            >
              Explore pricing
              <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
