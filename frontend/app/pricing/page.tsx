export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import { fetchHomeMetrics } from "@/lib/fetch-home-metrics"
import { formatCountWithPlus } from "@/lib/format-number"
import { HomePlanCarousel } from "@/components/home-plan-carousel"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"

const formatTemplate = (template?: string, vars: Record<string, string | number> = {}) => {
  if (!template) return ""
  return Object.entries(vars).reduce(
    (text, [token, value]) => text.replaceAll(`{{${token}}}`, String(value)),
    template,
  )
}

export default async function PricingPage() {
  const metrics = await fetchHomeMetrics()

  const serverCountDisplay = formatCountWithPlus(metrics?.totals.serverCount)
  const userCountDisplay = formatCountWithPlus(metrics?.totals.activeUsers)
  const streamsDisplay = formatCountWithPlus(metrics?.totals.totalStreams)
  const uptimeValue = metrics?.totals.uptimeLabel ?? "0%"
  const responseTimeValue = metrics?.totals.responseTimeMs
  const avgResponse =
    typeof responseTimeValue === "number" && Number.isFinite(responseTimeValue)
      ? `${Math.max(Math.round(responseTimeValue), 0)}ms`
      : "0ms"

  const templateVars = {
    servers: serverCountDisplay,
    listeners: userCountDisplay,
    streams: streamsDisplay,
    latency: avgResponse,
    uptime: uptimeValue,
  }

  const render = (template?: string, extraVars?: Record<string, string | number>) =>
    formatTemplate(template, { ...templateVars, ...extraVars })

  const pricingCurrency = (process.env.NEXT_PUBLIC_PRICING_CURRENCY || "EUR").toUpperCase()
  const formatPrice = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: pricingCurrency }).format(amount)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-16 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="relative max-w-6xl mx-auto text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold">Simple, transparent pricing</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            {render(
              "Trusted by {{servers}} live servers with {{latency}} average response time and {{uptime}} uptime. Every plan taps into the same telemetry-driven infrastructure—just decide which controls your community needs.",
            )}
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto space-y-6 text-center">
          <div>
            <h2 className="text-4xl font-bold mb-4">Choose the plan built for your community</h2>
            <p className="text-sm text-foreground/60">
              Slides rotate every 5 seconds. Hover to pause or drag/swipe to inspect each tier.
            </p>
          </div>
          <HomePlanCarousel />
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">What you get with each plan</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {Object.entries(MEMBERSHIP_TIERS).map(([tierKey, tier]) => (
              <div
                key={tierKey}
                className="p-8 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-all duration-300"
              >
                <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
                <p className="text-foreground/60 text-sm mb-6">{tier.description}</p>
                <ul className="space-y-3">
                  {tier.value.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="text-primary mt-0.5">✓</span>
                      <span className="text-foreground/70 text-sm">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Why premium plans pay for themselves</h2>
          <div className="space-y-6">
            {[
              {
                title: "Gaming community",
                benefit: "Latency-sensitive events stay synchronized even under peak loads.",
                value: render("Pro ({{price}}) keeps response times near {{latency}} throughout tournaments.", {
                  price: formatPrice(MEMBERSHIP_TIERS.pro.monthlyPrice),
                }),
              },
              {
                title: "Study group",
                benefit: "Curated playlists and scheduling for collaborative sessions.",
                value: render("Starter ({{price}}) enables group-wide focus sessions with reliable queue management.", {
                  price: formatPrice(MEMBERSHIP_TIERS.starter.monthlyPrice),
                }),
              },
              {
                title: "Creator network",
                benefit: "Content insights and stream-ready automations for public shows.",
                value: render("Pro ({{price}}) includes analytics tied to {{streams}} tracked broadcasts.", {
                  price: formatPrice(MEMBERSHIP_TIERS.pro.monthlyPrice),
                }),
              },
              {
                title: "Large organization",
                benefit: "Priority Care 24/7 support with under 4h responses plus enterprise telemetry for branded experiences.",
                value: render("Enterprise ({{price}}) pairs concierge support with a {{uptime}} uptime SLA.", {
                  price: formatPrice(MEMBERSHIP_TIERS.enterprise.monthlyPrice),
                }),
              },
            ].map((card) => (
              <div key={card.title} className="p-6 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-semibold text-lg">{card.title}</p>
                    <span className="text-sm text-primary font-semibold">{card.value}</span>
                  </div>
                  <p className="text-foreground/70 text-sm">{card.benefit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Success stories</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Gaming Tournament Organizer",
                challenge: "Needed reliable music across 8-hour finals featuring multiple casters.",
                solution: "Upgraded to Pro for dedicated routing plus live uptime diagnostics.",
                result: "Zero music interruptions across consecutive tournaments with tens of thousands of viewers.",
              },
              {
                title: "University Study Network",
                challenge: "Students wanted mood-based playlists that matched structured study sprints.",
                solution: "Starter provided curated playlists, timers, and light analytics for admins.",
                result: "Consistency across every semester with community feedback scores up 24%.",
              },
              {
                title: "Music Label Community",
                challenge: "Needed to know which artists and sounds resonated before big launches.",
                solution: "Pro analytics dashboard mapped top listeners, retention, and breakout tracks.",
                result: "Identified trending artists weeks earlier and boosted pre-save engagement by 31%.",
              },
            ].map((story, index) => (
              <div
                key={`${story.title}-${index}`}
                className="p-6 rounded-lg border border-border/50 bg-card/50 hover:bg-card/70 transition-all duration-300"
              >
                <h3 className="font-bold text-lg mb-3">{story.title}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground/60 uppercase">Challenge</p>
                    <p className="text-sm text-foreground/70">{story.challenge}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/60 uppercase">Solution</p>
                    <p className="text-sm text-foreground/70">{story.solution}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase">Result</p>
                    <p className="text-sm text-primary/80">{story.result}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center">
            <h2 className="text-4xl font-bold">Support coverage included</h2>
            <p className="text-foreground/70 mt-3">
              Every plan connects to the Support Desk. Pick the response window your moderators rely on.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Standard Care",
                subtitle: "Included with Free & Starter",
                bullets: [
                  "Email + Support Desk ticketing",
                  "First response under 24 hours",
                  "Access to the public incident feed",
                ],
              },
              {
                title: "Priority Care",
                subtitle: "Included with Pro, Growth, Scale & Enterprise",
                bullets: [
                  "Dedicated escalation channel",
                  "Hotline with 4h SLA",
                  "Quarterly health review with recommendations",
                ],
              },
            ].map((tier) => (
              <div key={tier.title} className="rounded-2xl border border-border/50 bg-background/60 p-6 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-primary/70">{tier.subtitle}</p>
                  <h3 className="text-2xl font-bold">{tier.title}</h3>
                </div>
                <ul className="space-y-2 text-sm text-foreground/70">
                  {tier.bullets.map((bullet, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              {
                question: "Is there still a free tier?",
                answer:
                  "Yes. The Free plan includes the Discord bot, essential music sources, and community support. Paid tiers unlock premium routing, automation, and billing features.",
              },
              {
                question: "How fast does VectoBeat respond?",
                answer:
                  "Live telemetry averages {{latency}} command times thanks to our EU-hosted Lavalink v4 cluster and automatic failover.",
              },
              {
                question: "Can I change or cancel my plan anytime?",
                answer:
                  "Absolutely. Upgrades apply instantly, downgrades take effect at the end of the billing cycle, and you can cancel without penalties inside the Control Panel.",
              },
              {
                question: "Which payment methods and currency do you support?",
                answer:
                  "All pricing is denominated in EUR (€). Stripe processes major credit and debit cards, SEPA direct debit, Apple Pay, and Google Pay. Enterprise invoices can be paid via bank transfer.",
              },
              {
                question: "How do I get help if something breaks?",
                answer:
                  "Start with the Support Desk chat for real-time ticketing, or email timhauke@uplytech.de for escalations. Paid tiers include guaranteed response windows and proactive incident alerts.",
              },
              {
                question: "Is there an API or webhook access?",
                answer:
                  "Starter and higher tiers receive REST + Webhook access for automation, event notifications, and billing callbacks. SDKs ship with examples for Node.js and Python.",
              },
            ].map((faq, index) => (
              <div key={`${faq.question}-${index}`} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-lg mb-3">{faq.question}</h3>
                <p className="text-foreground/70">{render(faq.answer)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-bold">Ready to start?</h2>
          <p className="text-xl text-foreground/70">
            {render("Join {{servers}} communities already streaming with VectoBeat every day.")}
          </p>
          <a
            href={DISCORD_BOT_INVITE_URL}
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Add to Discord
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
