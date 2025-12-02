import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import { buildPageMetadata } from "@/lib/seo"

const LAST_UPDATED = "2025-11-13"

export const metadata = buildPageMetadata({
  title: "Terms of Service | VectoBeat",
  description: "Terms of Service for using VectoBeat's Discord bot, control panel, and related services.",
  path: "/terms",
  noindex: true,
})

const sections = [
  {
    title: "1. Scope & Definitions",
    list: [
      "These Terms of Service (\"Terms\") govern the use of the VectoBeat Discord bot, APIs, control panel, forum, and related services (“Service”).",
      "Operator: Tim Hauke / VectoDE, Breitenburger Straße 15, 25524 Itzehoe, Germany (see Imprint).",
      "\"Customer\" or \"User\" includes any person or organisation inviting the bot, accessing the dashboard, or purchasing subscriptions.",
    ],
  },
  {
    title: "2. Contract Formation",
    list: [
      "Invitation of the bot or account creation triggers a binding usage agreement. Paid tiers are concluded when Stripe confirms payment.",
      "For Enterprise contracts, the SLA / EULA and any Statement of Work become part of the agreement.",
      "These Terms apply in addition to Discord's Terms of Service and relevant platform policies.",
    ],
  },
  {
    title: "3. Eligibility & Acceptable Use",
    list: [
      "Users must comply with applicable law, Discord policies, and intellectual property rights.",
      "Prohibited: streaming infringing content, harassment, spam, reverse engineering, security testing without written consent, or misusing automation to disrupt other services.",
      "We may rate-limit, suspend, or terminate accounts to protect platform stability or comply with legal obligations.",
    ],
  },
  {
    title: "4. Plans, Fees, Withdrawal",
    list: [
      "Prices are quoted in EUR and include VAT where legally required. Billing uses Stripe; payment methods may vary by region.",
      "Subscriptions renew monthly unless cancelled via the control panel or Stripe Customer Portal before the next billing date.",
      "EU/EEA consumers have a 14-day withdrawal right for digital services; it expires once you request immediate provision of premium features.",
      "Downgrades take effect at the next renewal. Usage fees already incurred are non-refundable unless mandated by law.",
    ],
  },
  {
    title: "5. Service Levels & Changes",
    list: [
      "Baseline service aims for 99.9% uptime; specific SLAs are defined on the SLA page or Enterprise agreements.",
      "We may modify, suspend, or discontinue features for legitimate reasons (security, legal compliance, performance). Material changes will be announced in advance.",
      "Beta or experimental features are provided without warranties and may be removed at any time.",
    ],
  },
  {
    title: "6. Data Protection & Security",
    body:
      "Processing of personal data follows the Privacy Policy and EU/GDPR standards. Customers must ensure they have appropriate rights to process member data and must promptly report security incidents affecting their communities.",
  },
  {
    title: "7. Liability",
    list: [
      "We are liable without limitation for intent, gross negligence, and for damages resulting from injury to life, body, or health.",
      "For slight negligence we are liable only for breach of essential contractual obligations, limited to foreseeable, contract-typical damages.",
      "We are not liable for indirect damages, lost profits, or data loss unless mandated by statutory law.",
      "Users indemnify us from third-party claims arising from unlawful content or misuse within their guilds.",
    ],
  },
  {
    title: "8. Termination & Suspension",
    list: [
      "Either party may terminate ordinary use at any time; remove the bot and delete the account to end the contract.",
      "We may suspend access immediately in case of legal violations, high-risk security events, or unpaid invoices.",
      "Upon termination we delete or anonymise data according to the Privacy Policy; billing data remains stored for statutory retention.",
    ],
  },
  {
    title: "9. Governing Law & Disputes",
    list: [
      "German law applies, excluding the UN Convention on Contracts for the International Sale of Goods (CISG).",
      "For merchants and public entities the exclusive venue is Itzehoe, Germany. Consumers may rely on the courts of their habitual residence.",
      "EU online dispute resolution platform: https://ec.europa.eu/consumers/odr. We are not obliged to participate in ADR, but we will consider voluntary resolutions.",
    ],
  },
  {
    title: "10. Amendments",
    body:
      "We may amend these Terms for legal, technical, or economic reasons. Changes will be announced at least 14 days in advance via email and in-app notice. Continued use after the effective date constitutes acceptance. If you object, you may terminate with immediate effect.",
  },
  {
    title: "11. Contact",
    body:
      "Support: support@uplytech.de • Legal & DSA contact: legal@uplytech.de • Abuse reports: abuse@uplytech.de • Phone (Priority Care): +49 (172) 6166860.",
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Terms of Service</h1>
          <p className="text-foreground/70">
            Last updated {new Date(LAST_UPDATED).toLocaleDateString("de-DE")} — compliant with German, European, and international regulations (status 13.11.2025)
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          {sections.map((section) => (
            <div key={section.title} className="space-y-4">
              <h2 className="text-2xl font-bold">{section.title}</h2>
              {section.body && <p className="text-foreground/70 leading-relaxed">{section.body}</p>}
              {section.list && (
                <ul className="space-y-3 text-foreground/70">
                  {section.list.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-primary font-semibold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-foreground/70 mb-6">
            By inviting the bot or creating an account you agree to these Terms. Questions?{" "}
            <Link href="/support-desk" className="text-primary font-semibold hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
