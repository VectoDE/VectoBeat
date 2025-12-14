import Link from "next/link"
import { ArrowLeft, Compass } from "lucide-react"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-58 pb-24 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-16 right-12 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/20 rounded-full blur-3xl opacity-20" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Compass className="text-primary" size={28} />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold">Page Not Found</h1>
          <p className="text-foreground/70 text-lg">
            The URL you requested does not exist or has been moved. Please return to the control panel or explore one of
            the highlighted areas below.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Home
            </Link>
            <Link
              href="/support-desk"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 px-4">
        <div className="max-w-4xl mx-auto grid gap-4 md:grid-cols-3">
          {[
            { label: "Features", href: "/features" },
            { label: "Pricing", href: "/pricing" },
            { label: "Statistics", href: "/stats" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-border/60 bg-card/40 p-4 text-center text-foreground/80 hover:border-primary/40 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  )
}
