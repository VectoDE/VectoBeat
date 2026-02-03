"use client"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Shield, GitBranch } from "lucide-react"

type Initiative = {
  title: string
  description: string
  status: "planned" | "building" | "alpha" | "beta" | "concept" | "live"
}

const telemetryComplianceInitiatives: Initiative[] = [
  {
    title: "Adaptive Mastering Pipeline",
    description: "Normalize perceived loudness per track to keep playlists consistent.",
    status: "live",
  },
  {
    title: "Compliance Mode",
    description: "Export-ready safety logs, GDPR tooling, and data residency controls.",
    status: "live",
  },
  {
    title: "Enterprise Hardening Pack",
    description: "SSO/SAML, SCIM lifecycle, and hardened audit/event signing for regulated tenants.",
    status: "live",
  },
  {
    title: "Trust & Safety Exports",
    description: "One-click bundles with consent receipts, permissions, and retention records.",
    status: "live",
  },
]

const longTermVision: Initiative[] = [
  {
    title: "Bot-to-Bot Federation",
    description: "Coordinate multiple VectoBeat instances for mega-events without manual sharding.",
    status: "live",
  },
  {
    title: "Predictive Health Scoring",
    description: "Signal queue or region degradation before listeners notice.",
    status: "live",
  },
  {
    title: "Plugin Marketplace",
    description: "Publish automation add-ons, analytics templates, and moderation packs.",
    status: "live",
  },
  {
    title: "Full White-Label Mode",
    description: "Custom domains, embeds, and branding for enterprise deployments.",
    status: "live",
  },
]

const statusToken: Record<
  Initiative["status"],
  { label: string; className: string }
> = {
  planned: {
    label: "Planned",
    className: "bg-primary/10 border-primary/20 text-primary",
  },
  building: {
    label: "Building",
    className: "bg-amber-500/10 border-amber-400/30 text-amber-200",
  },
  alpha: {
    label: "Private Alpha",
    className: "bg-sky-500/10 border-sky-400/40 text-sky-200",
  },
  beta: {
    label: "Beta",
    className: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200",
  },
  concept: {
    label: "Concept",
    className: "bg-foreground/10 border-border text-foreground/70",
  },
  live: {
    label: "Live",
    className: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200",
  },
}

const statusDot: Record<Initiative["status"], string> = {
  live: "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.2)]",
  beta: "bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.18)]",
  alpha: "bg-indigo-400 shadow-[0_0_0_4px_rgba(129,140,248,0.18)]",
  building: "bg-amber-400/80 shadow-[0_0_0_4px_rgba(251,191,36,0.14)]",
  planned: "bg-slate-500/70 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]",
  concept: "bg-slate-600/70 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]",
}

const roadmapPhases = [
  {
    phase: "Telemetry & Compliance",
    icon: Shield,
    color: "from-green-500 to-lime-500",
    features: telemetryComplianceInitiatives,
  },
  {
    phase: "Long-Term Vision",
    icon: GitBranch,
    color: "from-rose-500 to-orange-500",
    features: longTermVision,
  },
]

const timeline = [
  {
    period: "Jan 2026 – Present",
    items: [
      "Expanded Telemetry Webhooks (live)",
      "Adaptive Mastering Pipeline (live)",
      "Compliance Mode (live)",
      "Enterprise Hardening Pack (live)",
      "Trust & Safety Exports (live)",
      "Bot-to-Bot Federation (live)",
      "Predictive Health Scoring (live)",
      "Plugin Marketplace (live)",
      "Full White-Label Mode (live)",
    ],
  },
]

export default function Roadmap() {

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navigation />

      {/* Hero Section */}
      <section className="relative w-full pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40 animate-pulse" />
          <div className="absolute bottom-0 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl opacity-30 animate-pulse animation-delay-2000" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-balance animate-fade-in-up">
            VectoBeat{" "}
            <span className="bg-linear-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
              Roadmap
            </span>
          </h1>

          <p className="text-xl text-foreground/70 mb-8 max-w-3xl mx-auto text-pretty animate-fade-in-up animation-delay-200">
            Everything listed below mirrors the near-term and long-term vision from our About page and the upcoming forum launch plan.
            Reliability first, community second, and bold experiments right behind them.
          </p>
        </div>
      </section>

      {/* Roadmap Phases */}
      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-16">
            {roadmapPhases.map((phase, phaseIdx) => {
              const IconComponent = phase.icon
              return (
                <div key={phaseIdx} className="animate-fade-in-up" style={{ animationDelay: `${phaseIdx * 100}ms` }}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`p-3 rounded-lg bg-linear-to-br ${phase.color}`}>
                      <IconComponent size={28} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold">{phase.phase}</h2>
                      <p className="text-foreground/60 text-sm mt-1">Live & Production Ready</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {phase.features.map((feature, featureIdx) => {
                      const badge = statusToken[feature.status]
                      return (
                      <div
                        key={featureIdx}
                        className="p-6 rounded-lg border border-border/50 hover:border-primary/30 bg-card/30 hover:bg-card/50 transition-all duration-300 group"
                        style={{ animationDelay: `${phaseIdx * 100 + featureIdx * 50}ms` }}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <span
                            className={`mt-1 h-4 w-4 shrink-0 rounded-full ${statusDot[feature.status] ?? "bg-slate-500"}`}
                            aria-hidden="true"
                          />
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                            {feature.title}
                          </h3>
                        </div>
                        <p className="text-foreground/70 text-sm">{feature.description}</p>
                        <div className="mt-4 pt-4 border-t border-border/30">
                          <span
                            className={`inline-block px-3 py-1 border text-xs font-semibold rounded-full ${
                              badge?.className ?? "bg-primary/10 border-primary/20 text-primary"
                            }`}
                          >
                            {badge?.label ?? "Planned"}
                          </span>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Development Timeline</h2>
            <p className="text-foreground/70">
              Our development roadmap is updated after each release sprint. Features are prioritized based on community
              feedback and strategic goals.
            </p>
          </div>

          <div className="space-y-6">
            {timeline.map((entry, i) => (
              <div
                key={i}
                className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-all duration-300"
              >
                <h3 className="font-bold text-lg text-primary mb-4">{entry.period}</h3>
                <ul className="space-y-2">
                  {entry.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-3 text-foreground/80">
                      <span className="w-2 h-2 bg-primary rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Have Feature Requests?</h2>
          <p className="text-xl text-foreground/70 mb-8">
            Your feedback shapes our roadmap. Suggest features, report bugs, or contribute directly on GitHub.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/VectoDE/VectoBeat/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all duration-300"
            >
              GitHub Issues
            </a>
            <a
              href="https://discord.gg/vectobeat"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 transition-all duration-300"
            >
              Join Discord Community
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
