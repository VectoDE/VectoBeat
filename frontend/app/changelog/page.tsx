import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import type React from "react"
import { fetchChangelog, summarizeReleases } from "@/lib/changelog"

const getTypeBadgeColor = (type: string) => {
  switch (type) {
    case "major":
      return "bg-red-500/20 text-red-400 border border-red-500/30"
    case "minor":
      return "bg-blue-500/20 text-blue-400 border border-blue-500/30"
    case "patch":
      return "bg-green-500/20 text-green-400 border border-green-500/30"
    default:
      return "bg-primary/20 text-primary border border-primary/30"
  }
}

const getChangeTypeBadgeColor = (type: string) => {
  switch (type) {
    case "feature":
      return "bg-primary/10 text-primary"
    case "improvement":
      return "bg-blue-500/10 text-blue-400"
    case "bugfix":
      return "bg-green-500/10 text-green-400"
    default:
      return "bg-foreground/10 text-foreground/70"
  }
}

const isSafeUrl = (url?: string | null) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" ? parsed.href : null
  } catch {
    return null
  }
}

const extractAndLinkCommits = (text: string) => {
  const commitRegex = /\b([a-f0-9]{7,40})\b/g
  const parts: (string | React.ReactElement)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = commitRegex.exec(text)) !== null) {
    const [hash] = match
    const start = match.index
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }
    const rawCommitUrl = `https://github.com/VectoDE/VectoBeat/commit/${hash}`
    const safeCommitUrl = isSafeUrl(rawCommitUrl)
    parts.push(
      <a
        key={`commit-${match.index}-${hash}`}
        href={safeCommitUrl ?? "#"}
        target={safeCommitUrl ? "_blank" : undefined}
        rel={safeCommitUrl ? "noopener noreferrer" : undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 hover:bg-primary/30 text-primary rounded font-mono text-xs transition-colors duration-200"
      >
        <span>{hash.slice(0, 7)}</span>
        <span className="text-xs">↗</span>
      </a>,
    )
    lastIndex = start + hash.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export default async function ChangelogPage() {
  const releases = await fetchChangelog().catch((error) => {
    console.error("[VectoBeat] Failed to load changelog:", error)
    return []
  })
  const summaryCards = summarizeReleases(releases)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40 animate-pulse" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 animate-fade-in-up">Version History</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto animate-fade-in-up animation-delay-200">
            Real-time sync with the official GitHub repository. Every release, every change, every fix—directly from the source.
          </p>
        </div>
      </section>

        <section className="w-full py-12 px-4 border-b border-border">
        <div className="max-w-6xl mx-auto">
          {summaryCards.length ? (
            <div className="grid md:grid-cols-4 gap-6">
              {summaryCards.map((item, i) => (
                <div key={i} className="text-center p-4 animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="text-3xl font-bold text-primary mb-1">{item.value}</div>
                  <p className="text-foreground/60 text-sm">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-foreground/60">No releases have been recorded yet.</p>
          )}
        </div>
      </section>

      <section className="w-full py-12 px-4 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold mb-2">Official Repository</h3>
              <p className="text-foreground/80">
                The entire changelog is fetched automatically from GitHub. Follow the repository to be notified the moment new releases land.
              </p>
            </div>
            {(() => {
              const repoUrl = isSafeUrl("https://github.com/VectoDE/VectoBeat")
              return (
                <Link
                  href={repoUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Open GitHub
                  <span>→</span>
                </Link>
              )
            })()}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-8">
            {releases.length === 0 && (
              <div className="text-center text-foreground/60 py-12">
                No releases are available yet. As soon as the repository publishes one, it will appear here automatically.
              </div>
            )}

            {releases.map((release, idx) => (
              <div key={release.id} className="relative animate-rise-up" style={{ animationDelay: `${idx * 120}ms` }}>
                {idx < releases.length - 1 && (
                  <div className="absolute left-3 md:left-6 top-20 bottom-0 w-0.5 md:w-1 bg-linear-to-b from-primary/50 to-transparent" />
                )}
                <div className="absolute left-0 top-4 w-8 md:w-12 h-8 md:h-12 bg-background border-2 border-primary rounded-full flex items-center justify-center">
                  <div className="w-4 md:w-6 h-4 md:h-6 bg-primary rounded-full animate-pulse-scale" />
                </div>

                <div className="ml-16 md:ml-24 pb-8 p-4 md:p-6 rounded-lg border border-border/50 hover:border-primary/30 bg-card/30 transition-all duration-300 hover:bg-card/50">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h2 className="text-xl md:text-2xl font-bold wrap-break-word">{release.title}</h2>
                    <Badge className={`${getTypeBadgeColor(release.type)} text-xs md:text-sm`}>
                      {release.type.charAt(0).toUpperCase() + release.type.slice(1)}
                    </Badge>
                    <span className="text-foreground/60 text-xs md:text-sm">
                      {release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : "No date"}
                    </span>
                    {(() => {
                      const safeReleaseUrl = isSafeUrl(release.url)
                      return (
                        <Link
                          href={safeReleaseUrl ?? "#"}
                          target={safeReleaseUrl ? "_blank" : undefined}
                          rel={safeReleaseUrl ? "noopener noreferrer" : undefined}
                          className="text-primary text-xs md:text-sm hover:underline"
                        >
                          Release →
                        </Link>
                      )
                    })()}
                  </div>

                  {release.highlights.length > 0 && (
                    <div className="space-y-3 mb-5">
                      {release.highlights.map((highlight, i) => (
                        <div
                          key={i}
                          className="p-3 md:p-4 bg-primary/10 rounded-lg border border-primary/15 text-xs md:text-sm text-foreground/80"
                        >
                          {highlight}
                        </div>
                      ))}
                    </div>
                  )}

                  {release.changes.length > 0 ? (
                    <div className="space-y-3">
                      {release.changes.map((change, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-background/50 hover:border-primary/40 transition-colors"
                        >
                          <Badge className={`${getChangeTypeBadgeColor(change.type)} text-xs whitespace-nowrap`}>
                            {change.type}
                          </Badge>
                          <p className="text-foreground/80 text-sm">{extractAndLinkCommits(change.text)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">No detailed release notes were provided for this version.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
