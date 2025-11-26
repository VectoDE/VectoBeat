import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import { buildPageMetadata } from "@/lib/seo"

const LAST_UPDATED = "2025-11-13"

export const metadata = buildPageMetadata({
  title: "Service Level Agreement | VectoBeat",
  description: "Service Level Agreement outlining uptime, support response, and reliability commitments for VectoBeat.",
  path: "/sla",
  noindex: true,
})

const sections = [
  {
    title: "1. Scope & Priority",
    items: [
      "This Service Level Agreement (SLA) governs availability, response guarantees, and escalation duties for the VectoBeat Discord bot, control panel, APIs, and ancillary services.",
      "It supplements the Terms of Service and applies to all paid tiers. Free-tier users receive best-effort support without financial remedies.",
      "In case of conflict, the stricter commitment (Terms vs. SLA) prevails.",
    ],
  },
  {
    title: "2. Service Availability Targets",
    items: [
      "Production platform uptime commitment: 99.9% measured monthly across EU (Frankfurt), US (Ashburn), and APAC (Singapore) regions.",
      "Control panel uptime commitment: 99.5% measured monthly from Vercel edge locations.",
      "Exclusions: scheduled maintenance announced ≥48h in advance, force majeure, Discord-wide outages, or customer-controlled misconfiguration.",
    ],
  },
  {
    title: "3. Incident Classification & Response",
    table: {
      headers: ["Priority", "Definition", "First Response", "Resolution Target"],
      rows: [
        ["P1 – Critical", "Complete outage, security breach, or data loss affecting multiple guilds", "< 1h (24/7)", "< 4h or continuous engagement until mitigated"],
        ["P2 – High", "Severe degradation, automation failure, or billing block impacting a single region", "< 4h (24/7)", "< 12h with workaround or fix"],
        ["P3 – Medium", "Intermittent latency, UI defects, analytics delays", "< 24h (business days)", "< 3 business days"],
        ["P4 – Low", "Feature requests, documentation changes, cosmetic issues", "< 2 business days", "Scheduled in backlog with ETA"],
      ],
    },
  },
  {
    title: "4. Support Channels & Escalation",
    items: [
      "Standard Care (Free & Starter): Support Desk + email with <24h business-day responses.",
      "Priority Care (Pro, Growth, Scale, Enterprise): 24/7 hotline, Discord escalation channel, named incident manager, <4h response.",
      "Executive escalation: privacy, compliance, or contractual matters are handled via legal@uplytech.de within 1 business day.",
    ],
  },
  {
    title: "5. Maintenance & Change Management",
    items: [
      "Standard maintenance window: Tuesdays & Thursdays 00:00–03:00 CET with proactive Discord + email notice.",
      "Emergency maintenance is coordinated with at least 30 minutes notice on the status page and Support Desk broadcast.",
      "Major changes follow a rollback plan validated in staging environments that mirror live guild telemetry.",
    ],
  },
  {
    title: "6. Data Protection & Compliance",
    items: [
      "GDPR / DSGVO: VectoBeat acts as controller for account data and processor for guild telemetry. DPA available for Enterprise customers.",
      "EU Digital Services Act (DSA) & NetzDG: illegal content reports accepted via support and legal channels with ≤48h acknowledgment.",
      "International coverage: SCCs for transfers to the US; UK Addendum for UK residents; Brazilian LGPD and US state privacy rights honored.",
    ],
  },
  {
    title: "7. Credits & Remedies",
    items: [
      "Monthly uptime < commitment results in service credits equal to 5% of the affected month’s subscription fee per 0.1% shortfall, capped at 100%.",
      "Credits apply to future invoices; they are not refundable cash unless legally required.",
      "Eligibility: incidents must be reported within 10 business days of occurrence with reproducible evidence.",
    ],
  },
  {
    title: "8. Customer Responsibilities",
    items: [
      "Maintain updated contact methods and emergency webhooks inside the control panel.",
      "Ensure minimum bot permissions and shard routing recommended by VectoBeat to avoid misclassification of outages.",
      "Notify VectoBeat before large-scale events (>5,000 listeners) to guarantee adequate capacity.",
    ],
  },
  {
    title: "9. Contact Information",
    items: [
      "Primary support: timhauke@uplytech.de or Support Desk portal.",
      "Abuse & illegal content: legal@uplytech.de (response ≤48h).",
      "24/7 Incident Bridge (Priority Care): +49 172 6166860.",
    ],
  },
]

export default function SLAPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="relative max-w-6xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-primary/70">Service Level Agreement</p>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">VectoBeat SLA</h1>
          <p className="text-foreground/70">
            Effective {new Date(LAST_UPDATED).toLocaleDateString("de-DE")} • Compliant with German, European, and international standards as of
            13 November 2025.
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          {sections.map((section) => (
            <div key={section.title} className="space-y-4">
              <h2 className="text-2xl font-bold">{section.title}</h2>
              {section.items && (
                <ul className="space-y-3 text-foreground/70 leading-relaxed">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-primary font-semibold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {section.table && (
                <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/30">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th key={header} className="px-4 py-3 text-left font-semibold text-foreground/70 border-b border-border/40">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, index) => (
                        <tr key={index} className="border-b border-border/20 last:border-b-0">
                          {row.map((cell) => (
                            <td key={cell} className="px-4 py-3 text-foreground/80 align-top">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-t border-border">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-foreground/70">
            Need bespoke terms or a signed Data Processing Agreement?{" "}
            <Link href="/contact" className="text-primary font-semibold hover:underline">
              Contact our team
            </Link>{" "}
            or email legal@uplytech.de for Enterprise negotiations.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
