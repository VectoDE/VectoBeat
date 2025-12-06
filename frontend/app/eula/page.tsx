import Navigation from "@/components/navigation"
import Footer from "@/components/footer"

const LAST_UPDATED = "2025-11-13"

const clauses = [
  {
    title: "1. License Grant",
    items: [
      "VectoBeat grants you a non-exclusive, non-transferable, revocable licence to install and run the Discord bot, SDKs, and related tooling for the sole purpose of operating your Discord communities.",
      "The licence covers worldwide usage subject to compliance with these terms and applicable law.",
      "All rights not expressly granted remain with VectoBeat and its licensors.",
    ],
  },
  {
    title: "2. Ownership & Intellectual Property",
    items: [
      "All software, documentation, trademarks, and assets remain proprietary to VectoBeat.",
      "You may not remove copyright notices, reverse engineer, decompile, or create derivative works except where mandatory law permits.",
      "Open-source components are governed by their respective licences; we provide notices upon request.",
    ],
  },
  {
    title: "3. Permitted Use",
    items: [
      "Operate the bot within Discord servers you own or administer, respecting Discord’s Terms of Service.",
      "Integrate APIs and webhooks for internal workflows, dashboards, or automations.",
      "Make reasonable copies of documentation for internal training.",
    ],
  },
  {
    title: "4. Prohibited Use",
    items: [
      "Reselling, sublicensing, leasing, or providing the Service as a competing product.",
      "Bypassing technical protections, manipulating telemetry, or simulating traffic to inflate metrics.",
      "Using the software for unlawful surveillance, scraping personal data, or violating export control regulations.",
    ],
  },
  {
    title: "5. Updates & Feedback",
    items: [
      "Updates, patches, and hotfixes may be installed automatically. Continued use signifies acceptance of updated components.",
      "Feedback, suggestions, or code snippets you provide can be used to improve VectoBeat without obligation or compensation.",
    ],
  },
  {
    title: "6. Term & Termination",
    items: [
      "The licence remains in force while you maintain a valid account or subscription.",
      "We may suspend or terminate the licence immediately for material breach, legal compliance, non-payment, or security threats.",
      "Upon termination you must remove the bot, delete cached data, and cease use of all SDKs.",
    ],
  },
  {
    title: "7. Export & Sanctions Compliance",
    items: [
      "You confirm that you are not located in embargoed countries and are not a restricted party under EU, UK, or US sanctions.",
      "You will not export or re-export the software contrary to applicable laws.",
    ],
  },
  {
    title: "8. Warranties & Liability",
    items: [
      "The software is provided “as is” without warranties beyond those required by mandatory law.",
      "VectoBeat’s liability follows the limitations described in the Terms of Service.",
    ],
  },
  {
    title: "9. Governing Law",
    items: [
      "German law applies, excluding the UN Convention on Contracts for the International Sale of Goods.",
      "The courts of Itzehoe, Germany, have jurisdiction for merchants; consumers may litigate in their habitual residence.",
    ],
  },
  {
    title: "10. Contact",
    items: [
      "Licence questions: licensing@vectobeat.com",
      "Security or legal escalations: legal@uplytech.de • +49 172 6166860 (Priority Care hotline)",
    ],
  },
]

export default function EulaPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>
        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">End User Licence Agreement (EULA)</h1>
          <p className="text-foreground/70">
            Effective {new Date(LAST_UPDATED).toLocaleDateString("en-US")} – compliant with German, European, and international law (as of 13 November 2025)
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          {clauses.map((clause) => (
            <div key={clause.title} className="space-y-3">
              <h2 className="text-2xl font-bold">{clause.title}</h2>
              <ul className="space-y-2 text-foreground/70 leading-relaxed">
                {clause.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-primary font-semibold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-t border-border text-center">
        <p className="text-foreground/70">
          By installing or using VectoBeat you agree to this EULA, the Terms of Service, Privacy Policy, and SLA. If you disagree, uninstall the bot and contact
          support@vectobeat.com for assistance.
        </p>
      </section>

      <Footer />
    </div>
  )
}
