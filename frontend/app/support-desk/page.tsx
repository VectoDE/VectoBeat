import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { SupportDeskPanel } from "@/components/support-desk"
import Link from "next/link"

export default function SupportDeskPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-16 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-16 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-30" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Support Desk</p>
          <h1 className="text-4xl md:text-5xl font-bold">We’re here to help</h1>
          <p className="text-foreground/70 text-lg">
            Submit new tickets, track existing cases, or escalate incidents. Standard Care answers inside 24 hours, while Priority Care
            for Pro and above responds within 4 hours around the clock.
          </p>
        </div>
      </section>

      <section className="w-full py-16 px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          <SupportDeskPanel />

          <div className="grid gap-4 md:grid-cols-3 text-sm">
            {[
              {
                title: "Status & uptime",
                body: "Review live telemetry and regional uptime guarantees.",
                href: "/stats",
              },
              {
                title: "Incident policy",
                body: "Learn how we communicate and resolve outages.",
                href: "/imprint",
              },
              {
                title: "Privacy & data",
                body: "Understand how we handle user data during support.",
                href: "/privacy",
              },
            ].map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-2xl border border-border/40 bg-card/40 p-4 hover:border-primary/40 transition-colors"
              >
                <p className="text-sm font-semibold text-primary">{card.title}</p>
                <p className="text-foreground/70 mt-2">{card.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
