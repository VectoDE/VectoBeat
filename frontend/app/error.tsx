"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { correlationIdFromError } from "@/lib/error-utils"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const correlationId = useMemo(() => correlationIdFromError(error), [error])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    console.error("[VectoBeat] Section error", {
      correlationId,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    })
  }, [correlationId, error])

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(correlationId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border/50 bg-card/80 px-6 py-8 shadow-2xl backdrop-blur">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Unexpected error</p>
          <h1 className="text-3xl font-bold">We hit turbulence</h1>
          <p className="text-sm text-foreground/70">
            Something went wrong while rendering this view. Share the incident ID with support so we can dig in.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-border/40 bg-background/60 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-[0.2em] text-foreground/60">Correlation ID</p>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
              disabled={copied}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <code className="block rounded bg-card/60 px-3 py-2 text-sm text-primary break-all">{correlationId}</code>
          {error?.message && (
            <p className="text-xs text-foreground/60">
              {error.message.length > 160 ? `${error.message.slice(0, 160)}…` : error.message}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Retry loading
          </button>
          <Link
            href={`/support-desk?incident=${encodeURIComponent(correlationId)}`}
            className="w-full rounded-lg border border-border/60 px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Contact support
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-foreground/60">
          Need help fast? Send the correlation ID to{" "}
          <a href="mailto:support@vectobeat.com" className="font-semibold text-primary hover:underline">
            support@vectobeat.com
          </a>
          .
        </p>
      </div>
    </div>
  )
}
