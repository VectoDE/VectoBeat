import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import { buildPageMetadata } from "@/lib/seo"

const LAST_UPDATED = "2025-11-13"

export const metadata = buildPageMetadata({
  title: "Privacy Policy | VectoBeat",
  description: "Privacy policy for VectoBeat. Learn how we process data for Discord users and administrators.",
  path: "/privacy",
  noindex: true,
})

const sections = [
  {
    title: "1. Controller (Art. 4 No. 7 GDPR)",
    content: [
      "Tim Hauke – VectoDE / VectoBeat, Breitenburger Straße 15, 25524 Itzehoe, Germany",
      "Tel.: +49 (172) 6166860 • Email: timhauke@uplytech.de",
      "Data Protection Contact / DPO: legal@uplytech.de (responses ≤72h)",
    ],
  },
  {
    title: "2. Categories of Personal Data",
    content: [
      "Identity & contact data: Discord handle, ID, guild ownership, billing name, email, postal details.",
      "Usage & telemetry data: command logs, queue events, node metrics, incident traces (pseudonymised).",
      "Support data: ticket content, attachments, audit history, call recordings for Priority Care.",
      "Payment data: Stripe customer IDs, invoices, VAT information (stored by Stripe under SCCs).",
      "Website data: server logs, consent records, security events, essential cookies.",
    ],
  },
  {
    title: "3. Purposes & Legal Bases (Art. 6 GDPR)",
    content: [
      "Contract fulfilment Art. 6(1)(b) – providing the bot, automation, analytics, account area.",
      "Legitimate interest Art. 6(1)(f) – fraud prevention, abuse mitigation, telemetry, product analytics.",
      "Consent Art. 6(1)(a) – newsletters, beta programs, optional telemetry cookies.",
      "Legal obligation Art. 6(1)(c) – tax retention (AO/HGB), DSA illegal content handling, TTDSG logging.",
    ],
  },
  {
    title: "4. Recipients / Processors",
    content: [
      "Discord Inc. (USA) – OAuth & bot operations under SCCs and Discord Data Processing Addendum.",
      "Stripe Payments Europe (IE) – subscriptions, invoices, PSD2-compliant processing.",
      "Vercel Inc. (USA) – hosting + CDN (SCCs, encryption at rest).",
      "Hetzner Online GmbH (DE/EU) – Lavalink clusters, PostgreSQL, Redis.",
      "Trusted incident responders or auditors under strict confidentiality agreements when required.",
    ],
  },
  {
    title: "5. International Transfers",
    content: [
      "Standard Contractual Clauses (2021/914) cover transfers to the USA (Discord, Stripe, Vercel).",
      "UK Addendum & IDTA available for UK-based controllers.",
      "Brazil (LGPD) and other regions rely on Art. 49(1)(b) equivalents or local SCCs.",
    ],
  },
  {
    title: "6. Retention & Deletion",
    content: [
      "OAuth tokens & sessions: 30 days after inactivity, earlier on manual revocation.",
      "Telemetry: 30 days rolling unless required for incident investigation (max 90 days).",
      "Support tickets: 24 months (DSA/NetzDG traceability) then anonymised.",
      "Billing records: 10 years (AO/HGB).",
      "Backups: encrypted, 35-day rolling window with automatic purge.",
    ],
  },
  {
    title: "7. Cookies & Similar Technologies (TTDSG)",
    content: [
      "Essential cookies (session, CSRF, security) always active.",
      "Optional analytics cookies only after explicit consent via banner.",
      "No third-party advertising cookies or cross-site tracking pixels.",
      "Detailed cookie list available inside the control panel privacy tab.",
    ],
  },
  {
    title: "8. Data Subject Rights",
    content: [
      "Access, rectification, erasure, restriction, portability, objection, and withdrawal of consent (Arts. 15–22 GDPR).",
      "Automated decision-making is not performed; no profiling beyond aggregated telemetry.",
      "Requests: privacy@vectobeat.com with Discord ID for verification; replies within 30 days.",
      "Complaints: ULD Schleswig-Holstein or any competent supervisory authority.",
    ],
  },
  {
    title: "9. International Frameworks",
    content: [
      "UK GDPR / DPA 2018 – UK-based customers may contact the ICO if unsatisfied.",
      "USA (CCPA/CPRA) – no sale of data; opt-out and sensitive data limitations honoured.",
      "Brazil (LGPD) – local representative on request; rights handled via privacy@vectobeat.com.",
    ],
  },
  {
    title: "10. Security Measures (Art. 32 GDPR)",
    content: [
      "Zero-trust network, hardware security modules, audited access control, and quarterly penetration tests.",
      "TLS 1.3 transport encryption, AES-256-at-rest for databases and secrets, scoped service tokens.",
      "24/7 Security Operations (Priority Care) with incident runbooks mapped to ISO/IEC 27001 controls.",
    ],
  },
  {
    title: "11. Data Protection Officer & Supervisory Authority",
    content: [
      "DPO / Privacy Contact: legal@uplytech.de, phone +49 172 6166860 for urgent matters.",
      "Supervisory authority: Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein, Holstenstraße 98, 24103 Kiel, Germany.",
    ],
  },
  {
    title: "12. Changes",
    content: [
      "This notice reflects legal status as of 13 November 2025. Substantial updates are announced 14 days in advance via email and in-app notifications.",
      "The current version is always available at https://vectobeat.uplytech.de/privacy.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-foreground/70">
            Last updated {new Date(LAST_UPDATED).toLocaleDateString("de-DE")} • GDPR / DSA / TTDSG / UK GDPR / CCPA / LGPD compliant
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
              <ul className="space-y-3 text-foreground/70 leading-relaxed">
                {section.content.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-primary font-semibold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-foreground/70 space-y-3">
            <p>
              Questions about this policy? Email{" "}
              <a href="mailto:privacy@uplytech.de" className="text-primary hover:underline">
                privacy@uplytech.de
              </a>{" "}
              or contact legal@uplytech.de with your Discord ID so we can verify your identity.
            </p>
            <p>
              Supervisory authority (Germany): Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein (ULD), Holstenstraße 98, 24103 Kiel, Germany.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-foreground/70 mb-6">
            Need help exercising your privacy rights?{" "}
            <Link href="/support-desk" className="text-primary font-semibold hover:underline">
              Contact our support team
            </Link>
            .
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
