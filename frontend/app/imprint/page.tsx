import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import { buildPageMetadata } from "@/lib/seo"

const LAST_UPDATED = "2025-11-13"

export const metadata = buildPageMetadata({
  title: "Imprint | VectoBeat",
  description: "Imprint and legal disclosure for VectoBeat.",
  path: "/imprint",
  noindex: true,
})

export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Imprint & Legal Notice</h1>
          <p className="text-foreground/70">
            Information pursuant to Section 5 TMG / Section 14 Austrian Commercial Code — Last updated{" "}
            {new Date(LAST_UPDATED).toLocaleDateString("en-US")}
          </p>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          <div>
            <h2 className="text-2xl font-bold mb-4">Service provider (Section 5 TMG)</h2>
            <div className="bg-card/30 border border-border rounded-2xl p-6 text-foreground/70 space-y-3">
              <ul className="space-y-1">
                <li>Tim Hauke — operating as “VectoDE / VectoBeat”</li>
                <li>c/o UplyTech, Breitenburger Strasse 15, 25524 Itzehoe, Germany</li>
                <li>Phone: +49 (172) 6166860</li>
                <li>Email (General): contact@uplytech.de</li>
                <li>Email (Support): support@uplytech.de</li>
                <li>Email (Legal / DSA): legal@uplytech.de</li>
              </ul>
              <p>Responsible under Section 18(2) MStV: Tim Hauke, address as above.</p>
              <p>VAT ID (if assigned): provided on request. The small business regulation (Section 19 UStG) currently does not apply.</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Hosting & Technical Infrastructure</h2>
            <div className="bg-card/30 border border-border rounded-2xl p-6 text-foreground/70 space-y-3">
              <p>
                Web hosting &amp; CDN: Uplytech infrastructure (Breitenburger Strasse 15, 25524 Itzehoe, Germany). Primary application servers
                and the public CDN edge are operated on Uplytech-owned hardware in Germany.
              </p>
              <p>
                Bot &amp; Lavalink clusters: Uplytech-operated bare-metal nodes that host the Discord bot runtime and the Lavalink audio
                cluster across Frankfurt (DE) and Amsterdam (NL) for low-latency failover.
              </p>
              <p>
                Database &amp; encryption: Prisma ORM on a managed MySQL cluster maintained by Uplytech with AES-256 encryption at rest and
                encrypted EU backups.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Liability notice</h2>
            <div className="space-y-4 text-foreground/70">
              <p>
                <strong>Content liability:</strong> As a service provider we are responsible for our own content pursuant to Section 7(1) TMG, yet we cannot
                guarantee completeness, accuracy, or timeliness.
              </p>
              <p>
                <strong>Links:</strong> External links were checked when first published. The respective provider is solely responsible for linked content
                (Sections 8–10 TMG). We remove unlawful links immediately once we become aware of them.
              </p>
              <p>
                <strong>Operation of VectoBeat:</strong> The Discord bot is provided “as is”. There is no entitlement to permanent availability, feature scope,
                or specific audio sources. Users have no claim for damages arising from outages unless caused by intent or gross negligence.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Copyright</h2>
            <div className="space-y-4 text-foreground/70">
              <p>
                Content, source code, trademarks, and designs of VectoBeat are protected by German and international copyright law. Third-party contributions
                are marked accordingly. Public source code is available on GitHub under the respective open-source licences.
              </p>
              <p>“VectoBeat” is a business designation of VectoDE. Discord® and related logos are trademarks of Discord Inc.</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Point of contact for illegal content (Art. 16 DSA)</h2>
            <div className="space-y-4 text-foreground/70">
              <p>
                Reports of illegal content on VectoBeat-operated platforms can be sent to timhauke@uplytech.de. Please include a clear description and
                supporting evidence. Submissions receive a qualified response within 48 hours.
              </p>
            </div>
          </div>

          <div className="bg-card/30 border border-border rounded-2xl p-6 text-foreground/70 space-y-2">
            <p>
              <strong>Effective date:</strong> {new Date(LAST_UPDATED).toLocaleDateString("en-US")}
            </p>
            <p>This version reflects German, European, and international law as of 13 November 2025.</p>
            <p className="mt-1">The current version is always available at https://vectobeat.uplytech.de/imprint.</p>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-foreground/70 mb-6">
            Questions about this imprint?{" "}
            <Link href="/contact" className="text-primary font-semibold hover:underline">
              Get in touch
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
