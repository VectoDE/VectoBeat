"use client"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { XCircle, ArrowLeft, RefreshCcw, ShieldAlert, Clock } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"

type CheckoutSummary = {
  id: string
  status: string | null
  paymentStatus: string | null
  amountTotal: number | null
  currency: string | null
  customerEmail: string | null
  customerName: string | null
  tierId: string | null
  billingCycle: string | null
}

const maskSessionId = (value: string | null) => {
  if (!value) return "unbekannt"
  const trimmed = value.replace(/^cs_[^_]*_/i, "")
  const tail = trimmed.slice(-8)
  return `••••${tail}`
}

export default function FailedPage() {
  return (
    <Suspense fallback={null}>
      <FailedContent />
    </Suspense>
  )
}

function FailedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams?.get("session_id") ?? null
  const [statusMessage, setStatusMessage] = useState("We could not confirm your payment.")
  const [checkoutInfo, setCheckoutInfo] = useState<CheckoutSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) {
      return
    }

    let cancelled = false

    fetch(`/api/checkout?session_id=${sessionId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Checkout session not found")
        }
        return res.json()
      })
      .then((data: CheckoutSummary) => {
        if (cancelled) return
        setCheckoutInfo(data)
        setLoading(false)
        if (data.paymentStatus === "paid") {
          setStatusMessage("Payment already succeeded. Check your email or the Success page for confirmation.")
        } else if (data.status === "expired") {
          setStatusMessage("Checkout session expired before completion. No charges were made.")
        } else {
          setStatusMessage("Payment was not completed. Your card has not been charged.")
        }
      })
      .catch(() => {
        if (cancelled) return
        setStatusMessage("We could not load the checkout details. Please retry your purchase or contact support.")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      router.replace("/pricing?checkout=required")
    }
  }, [sessionId, router])

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <div className="flex-1 flex items-center justify-center px-4 py-28">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="mb-4 flex justify-center">
              <XCircle size={64} className="text-destructive animate-pulse" />
            </div>
            <h1 className="text-5xl font-bold">Payment Failed</h1>
            {loading && <p className="text-sm text-foreground/60">Retrieving Stripe checkout details…</p>}
            <p className="text-lg text-foreground/70 max-w-2xl mx-auto">{statusMessage}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card/30 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldAlert size={24} className="text-primary" />
                <div>
                  <p className="text-lg font-semibold">Common causes</p>
                  <p className="text-sm text-foreground/70">Bank declines, expired cards, or duplicate charges trigger this page.</p>
                </div>
              </div>
              <ul className="text-sm text-foreground/80 space-y-2">
                <li>• Confirm your payment method is authorized for EUR transactions.</li>
                <li>• Ensure the billing email matches the one you entered in checkout.</li>
                <li>• If you saw a charge, do not retry—instead contact support with the reference ID.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/30 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Clock size={24} className="text-primary" />
                <div>
                  <p className="text-lg font-semibold">Need help fast?</p>
                  <p className="text-sm text-foreground/70">
                    Support Desk responses: Standard Care &lt;24h, Priority Care &lt;4h (24/7).
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/support-desk"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Contact Support
                  <ArrowLeft size={16} />
                </Link>
                <Link href="mailto:timhauke@uplytech.de" className="text-sm text-foreground/70 hover:text-primary">
                  Email timhauke@uplytech.de
                </Link>
              </div>
            </div>
          </div>

          {checkoutInfo && (
            <div className="rounded-2xl border border-border/60 bg-card/30 p-6 space-y-4 text-sm text-foreground/80">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">Stripe session details</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-foreground/60">Session ID</p>
                  <p className="font-semibold break-all">{maskSessionId(checkoutInfo.id)}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Payment status</p>
                  <p className="font-semibold">{checkoutInfo.paymentStatus ?? checkoutInfo.status ?? "unknown"}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Customer email</p>
                  <p className="font-semibold break-all">{checkoutInfo.customerEmail ?? "not provided"}</p>
                </div>
                <div>
                  <p className="text-foreground/60">Plan</p>
                  <p className="font-semibold">
                    {checkoutInfo.tierId ? checkoutInfo.tierId.replace(/_/g, " ") : "N/A"} {checkoutInfo.billingCycle ? `(${checkoutInfo.billingCycle})` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-card/20 p-6 space-y-4 text-center">
            <p className="text-foreground/70">
              Ready to try again? Return to the pricing page to restart checkout. No charges are made until confirmation succeeds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Retry Checkout
                <RefreshCcw size={18} />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-lg border border-border/60 text-foreground hover:border-primary/60 hover:text-primary transition-colors"
              >
                Back to Home
                <ArrowLeft size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
