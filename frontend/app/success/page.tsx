"use client"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { CheckCircle, ArrowRight, Download, FileText, ShieldCheck, Clock } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"

interface CheckoutSummary {
  id: string
  status: string | null
  paymentStatus: string | null
  amountTotal: number | null
  currency: string | null
  customerEmail: string | null
  customerName: string | null
  subscriptionId: string | null
  nextBilling: string | null
  tierId: string | null
  billingCycle: string | null
  guildId: string | null
  guildName: string | null
}

const currencyFormatter = (currency: string) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: currency.toUpperCase() })

const maskSessionId = (value: string | null) => {
  if (!value) return "unbekannt"
  const trimmed = value.replace(/^cs_[^_]*_/i, "")
  const tail = trimmed.slice(-8)
  return `••••${tail}`
}

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams?.get("session_id") ?? null
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      router.replace("/pricing?checkout=required")
      return
    }

    let cancelled = false

    fetch(`/api/checkout?session_id=${sessionId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Unable to load the Stripe checkout session")
        }
        return res.json()
      })
      .then((data: CheckoutSummary) => {
        if (cancelled) return
        setSummary(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[VectoBeat] Failed to load checkout session:", err)
        setError("We could not confirm Stripe’s response, but your payment may still be processing. Check your email for confirmation receipts.")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, router])

  const planPerks = useMemo(
    () => [
      "Priority routing across all Lavalink clusters",
      "Advanced analytics dashboards refreshed every minute",
      "Incident escalation through the on-call engineering desk",
      "White-glove onboarding session for your moderation team",
    ],
    [],
  )

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <p className="text-foreground/70 text-sm">Redirecting to pricing…</p>
        </div>
        <Footer />
      </div>
    )
  }

  const tierId = summary?.tierId ?? undefined
  const tierLabel = tierId && MEMBERSHIP_TIERS[tierId as keyof typeof MEMBERSHIP_TIERS]?.name
  const planName = tierLabel || tierId?.replace(/_/g, " ") || "Premium"
  const billingEmail = summary?.customerEmail || "timhauke@uplytech.de"
  const amountCents = typeof summary?.amountTotal === "number" ? summary.amountTotal : 0
  const currency = (summary?.currency || "EUR").toUpperCase()
  const normalizedAmount = amountCents / 100
  const amountDisplay = currencyFormatter(currency).format(normalizedAmount)
  const nextBilling =
    summary?.nextBilling && !Number.isNaN(Date.parse(summary.nextBilling))
      ? new Date(summary.nextBilling).toLocaleDateString("de-DE")
      : "30 days from now"
  const invoiceAvailable = summary?.paymentStatus === "paid"

  const invoiceLink = summary?.id ? `/api/billing/invoice?sessionId=${encodeURIComponent(summary.id)}` : null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <div className="flex-1 flex items-center justify-center px-4 py-28">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="mb-4 flex justify-center">
              <CheckCircle size={64} className="text-primary animate-pulse" />
            </div>
            <h1 className="text-5xl font-bold">Payment Successful!</h1>
            <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
              Thank you for upgrading to VectoBeat. Your control panel now reflects the new plan and every premium feature
              listed below is ready to use across your servers.
            </p>
            {loading && <p className="text-sm text-foreground/60">Verifying your Stripe session…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card/30 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs tracking-[0.35em] uppercase text-foreground/60">Subscription Summary</p>
                  <p className="text-2xl font-bold">{planName}</p>
                </div>
                <span className="text-3xl font-semibold text-primary">{amountDisplay}</span>
              </div>
              <div className="space-y-3 text-sm text-foreground/70">
                <div className="flex justify-between">
                  <span>Billing contact</span>
                  <span className="font-semibold">{billingEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stripe session</span>
                  <span className="font-semibold">{maskSessionId(summary?.id ?? null)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Next cycle</span>
                  <span className="font-semibold">{nextBilling}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/control-panel"
                  className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                >
                  Go to Control Panel
                  <ArrowRight size={18} />
                </Link>
                {invoiceAvailable && invoiceLink ? (
                  <a
                    href={invoiceLink}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    <Download size={16} />
                    Download Invoice
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border/60 rounded-lg text-sm opacity-60 cursor-not-allowed"
                  >
                    <Download size={16} />
                    Invoice available after payment
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/30 p-6">
              <div className="flex items-center gap-3 mb-3">
                <FileText size={24} className="text-primary" />
                <div>
                  <p className="text-lg font-semibold">What You Just Unlocked</p>
                  <p className="text-sm text-foreground/70">
                    These premium capabilities are now available within your control panel.
                  </p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-foreground/80">
                {planPerks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <ShieldCheck size={16} className="text-primary mt-0.5" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/20 p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              <h3 className="font-semibold uppercase tracking-[0.3em] text-xs text-foreground/60">Billing Timeline</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div className="p-4 rounded-lg border border-border/40 bg-background/60">
                <p className="text-foreground/60 text-xs uppercase">Activation</p>
                <p className="font-semibold">{new Date().toLocaleDateString("de-DE")}</p>
                <p className="text-xs text-foreground/60">Premium features enabled immediately.</p>
              </div>
              <div className="p-4 rounded-lg border border-border/40 bg-background/60">
                <p className="text-foreground/60 text-xs uppercase">Next invoice</p>
                <p className="font-semibold">{nextBilling}</p>
                <p className="text-xs text-foreground/60">Cancel or change anytime from the control panel.</p>
              </div>
              <div className="p-4 rounded-lg border border-border/40 bg-background/60">
                <p className="text-foreground/60 text-xs uppercase">Download</p>
                <p className="font-semibold">{summary?.paymentStatus === "paid" ? "PDF available" : "Pending payment confirmation"}</p>
                <p className="text-xs text-foreground/60">Every payment generates a VAT-compliant PDF.</p>
              </div>
            </div>
          </div>

          {summary && (
            <div className="rounded-2xl border border-border/50 bg-card/30 p-6 space-y-4 text-sm text-foreground/80">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">Stripe Session Details</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-foreground/60">Session ID</p>
                  <p className="font-semibold break-all">{summary.id}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Payment status</p>
                  <p className="font-semibold">{summary.paymentStatus ?? summary.status ?? "unknown"}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Customer name</p>
                  <p className="font-semibold break-all">{summary.customerName || "—"}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Customer email</p>
                  <p className="font-semibold break-all">{billingEmail}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="p-6 bg-card/30 border border-border/50 rounded-xl">
              <h3 className="font-semibold mb-3">Next Steps</h3>
              <ul className="space-y-2 text-foreground/80 text-sm">
                <li>✓ Invite VectoBeat to each production server</li>
                <li>✓ Use `/premium` to verify the upgrade in Discord</li>
                <li>✓ Configure per-server automation inside Settings</li>
                <li>✓ Share the invoice with your finance or procurement team</li>
              </ul>
            </div>
            <div className="p-6 bg-card/30 border border-border/50 rounded-xl space-y-3">
              <h3 className="font-semibold">Need help with onboarding?</h3>
              <p className="text-sm text-foreground/70">
                Our Support Desk guides moderators through analytics, automation, and safety tooling. Standard Care responds inside
                24 hours, while Priority Care for Pro, Growth, Scale, and Enterprise stays on-call 24/7 with a 4-hour SLA.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/support-desk"
                  className="inline-flex px-4 py-2 bg-primary/10 text-primary rounded-lg font-semibold hover:bg-primary/20 transition-colors text-sm"
                >
                  Open Support Desk
                </Link>
                <Link href="mailto:timhauke@uplytech.de" className="text-sm text-foreground/70 hover:text-primary">
                  or email timhauke@uplytech.de
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 space-y-4 text-center">
            <h3 className="text-2xl font-bold">Continue building with VectoBeat</h3>
            <p className="text-foreground/70 max-w-3xl mx-auto">
              Jump back into the control panel to configure automation, invite teammates, and monitor analytics, or review the roadmap to
              see what’s rolling out next.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/control-panel"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Open Control Panel
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/roadmap"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/10 transition-colors"
              >
                View Roadmap
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
