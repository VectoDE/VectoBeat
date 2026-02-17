"use client"

// This page is rendered client-side to allow lightweight parsing of the local changelog
// without blocking the initial response; data is fetched from an internal API route.

import { useEffect, useState } from "react"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { apiClient } from "@/lib/api-client"

type PatchWave = {
  title: string
  date: string
  cves: string[]
  status: string
  cveSummaries?: Array<{ id: string; summary: string }>
}

type SecuritySummary = {
  patches: PatchWave[]
  totalCves: number
  latestDate: string | null
}

export default function SecurityPatchesPage() {
  const [data, setData] = useState<SecuritySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPatches = async () => {
      try {
        const payload = await apiClient<SecuritySummary>("/api/security/patches", { cache: "no-store" })
        setData(payload)
      } catch (error) {
        console.error("[VectoBeat] Failed to load security patches:", error)
      } finally {
        setLoading(false)
      }
    }
    void fetchPatches()
  }, [])

  const patches = data?.patches ?? []
  const totalCves = data?.totalCves ?? 0
  const latestDate = data?.latestDate ?? null

  const scoreCards = [
    {
      title: "Patch waves",
      value: patches.length ? patches.length.toString() : "0",
      detail: "Pulled from changelog",
    },
    {
      title: "CVEs tracked",
      value: totalCves ? totalCves.toString() : "0",
      detail: "Detected in release notes",
    },
    {
      title: "Latest update",
      value: latestDate || "N/A",
      detail: "Most recent security entry",
    },
    {
      title: "Reload strategy",
      value: "Hot reload",
      detail: "Zero-downtime patching",
    },
  ]

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navigation />

      <section className="relative w-full pt-32 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-12 right-6 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-30" />
          <div className="absolute -bottom-16 left-8 w-96 h-96 bg-secondary/20 rounded-full blur-3xl opacity-25" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Zero-Downtime Security</p>
          <h1 className="text-4xl md:text-5xl font-bold text-balance mt-3">Live security patches from changelog</h1>
          <p className="mt-4 text-lg text-foreground/70 max-w-3xl">
            Every patch wave ships through the self-healing grid: hot reloads, no listener drops, and telemetry back to the
            control panel. This page pulls real entries from the changelog to summarize recent security work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30 text-xs font-semibold">
              Live from changelog
            </span>
            <span className="inline-flex items-center rounded-full bg-sky-500/10 text-sky-200 px-3 py-1 border border-sky-500/30 text-xs font-semibold">
              Hot-reloadable patches
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-200 px-3 py-1 border border-amber-500/30 text-xs font-semibold">
              Dependency risk tracking
            </span>
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-12">
        <div className="max-w-6xl mx-auto grid gap-4 md:grid-cols-4">
          {scoreCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-border/50 bg-card/40 p-5">
              <p className="text-sm text-foreground/60">{card.title}</p>
              <p className="text-3xl font-bold mt-2">{card.value}</p>
              <p className="text-sm text-foreground/70 mt-2">{card.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full px-4 pb-20">
        <div className="max-w-6xl mx-auto space-y-4">
          {loading && <p className="text-sm text-foreground/60">Loading security patches…</p>}
          {!loading && patches.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
              <p className="text-sm text-foreground/70">No security-related changelog entries found.</p>
            </div>
          ) : null}
          {patches.map((wave, index) => (
            <div
              key={`${wave.title}-${wave.date}-${index}`}
              className="rounded-2xl border border-border/60 bg-card/40 p-6 hover:border-primary/40 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Security Patch</p>
                  <h3 className="text-2xl font-semibold text-foreground">
                    {wave.title} · {wave.date}
                  </h3>
                  {/* Security narrative is synthesized per CVE; raw changelog text is not displayed */}
                </div>
                <div className="flex flex-col items-end gap-2 w-full lg:w-auto">
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30 text-xs font-semibold">
                    {wave.status}
                  </span>
                  <ul className="text-xs text-foreground/70 space-y-2 text-left lg:text-right max-w-xl">
                    {wave.cves.length ? (
                      wave.cves.map((cve, idx) => {
                        const summary = wave.cveSummaries?.[idx]?.summary || "Security update summary unavailable."
                        return (
                          <li key={cve} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                            <div className="text-left">
                              <p className="font-semibold text-foreground">{cve}</p>
                              <p className="text-[11px] text-foreground/60">{summary}</p>
                            </div>
                          </li>
                        )
                      })
                    ) : (
                      <li className="text-foreground/50">No CVEs listed</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  )
}
