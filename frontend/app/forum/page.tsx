export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"

const SUPPORT_DESK_LINK = "/support-desk"
const CHANGELOG_LINK = "/changelog"

export default async function ForumPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-16 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-16 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-30" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-primary/70">Community Forum</p>
          <h1 className="text-4xl md:text-5xl font-bold">Coming soon</h1>
          <p className="text-foreground/70 text-lg">
            We are building a dedicated discussion forum where server owners, moderators, and creators can share best practices,
            swap automation snippets, and preview upcoming VectoBeat features.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={SUPPORT_DESK_LINK}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Visit Support Desk
            </Link>
            <Link
              href={CHANGELOG_LINK}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors"
            >
              Follow updates
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 px-4">
        <div className="max-w-5xl mx-auto grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Topic Spaces",
              body: "Dedicated channels for onboarding, analytics, sound design, and compliance so you can find answers faster.",
            },
            {
              title: "Early Feedback",
              body: "Vote on roadmap items, test beta features, and shape how the bot evolves with structured threads.",
            },
            {
              title: "Launch Timeline",
              body: "Private alpha in April → public beta early summer. Pro+ customers receive priority invites.",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-2xl border border-border/50 bg-card/40 p-6">
              <h2 className="text-xl font-semibold mb-3">{card.title}</h2>
              <p className="text-sm text-foreground/70">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full py-16 px-4 border-t border-border bg-card/30">
        <div className="max-w-5xl mx-auto grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold mb-4">What you’ll find inside</h2>
            <ul className="space-y-3 text-foreground/70 text-sm leading-relaxed">
              {[
                "Launch playbooks for music, moderation, and analytics use cases",
                "Automation snippets to sync playlists, announcements, and status embeds",
                "Release previews with dedicated feedback threads before public rollout",
                "Regional latency dashboards posted by the operations team",
                "Office hours with the VectoBeat engineers and success managers",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="text-primary">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/70 p-6 space-y-4 text-sm text-foreground/70">
            <h3 className="text-xl font-semibold text-foreground">Getting ready</h3>
            <ul className="space-y-2">
              {[
                "Connect your Discord account and verify email",
                "Enable Support Desk notifications for incident briefs",
                "Share at least one success story or use-case outline",
              ].map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <p className="text-foreground/60">
              Accepted communities will receive a private invite link and role tags so you can immediately subscribe to relevant
              categories (analytics, safety, queue design, etc.).
            </p>
            <Link
              href={SUPPORT_DESK_LINK}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors"
            >
              Join the waitlist via Support Desk
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 px-4">
        <div className="max-w-5xl mx-auto space-y-6 text-center">
          <h2 className="text-3xl font-bold">Forum launch timeline</h2>
          <p className="text-sm text-foreground/60">April: private alpha → June: open beta → Summer: public read access + Support Desk integration.</p>
          <p className="text-sm text-foreground/50">
            Moderation guidelines, code of conduct, and category list will be published ahead of the beta so you can prepare your team.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
