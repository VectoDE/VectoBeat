export const dynamic = "force-dynamic"

import Link from "next/link"

import Footer from "@/components/footer"
import Navigation from "@/components/navigation"
import { ForumThreadBrowser } from "@/components/forum-thread-browser"
import { listForumCategories, listForumPosts, listForumThreads } from "@/lib/db"
import { siteUrl } from "@/lib/seo"
import { getForumViewerContext } from "./utils"
import DOMPurify from "isomorphic-dompurify"

const SUPPORT_DESK_LINK = "/support-desk"
const ROADMAP_LINK = "/roadmap"

const accentPalette = [
  "from-emerald-500 to-cyan-500",
  "from-sky-500 to-indigo-500",
  "from-amber-500 to-rose-500",
  "from-purple-500 to-pink-500",
  "from-blue-500 to-emerald-500",
  "from-slate-500 to-slate-700",
]

export default async function ForumPage() {
  const viewer = await getForumViewerContext()
  const categories = await listForumCategories()
  const allThreads = await listForumThreads()

  const defaultCategory =
    categories.find((cat) => allThreads.some((thread) => thread.categorySlug === cat.slug))?.slug ||
    categories[0]?.slug ||
    allThreads[0]?.categorySlug ||
    ""

  const initialThreads = defaultCategory
    ? allThreads.filter((thread) => thread.categorySlug === defaultCategory)
    : allThreads
  const initialPosts = initialThreads[0] ? await listForumPosts(initialThreads[0].id) : []
  const latestThreads = allThreads.slice(0, 6)
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "VectoBeat Forum",
      description:
        "Community discussions for VectoBeat users covering Discord music automation, telemetry, reliability, and support.",
      url: `${siteUrl}/forum`,
      about: categories.map((cat) => ({
        "@type": "Thing",
        name: cat.title,
        description: cat.description ?? `${cat.threadCount} threads in ${cat.title}`,
        url: `${siteUrl}/forum/${cat.slug}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Forum", item: `${siteUrl}/forum` },
      ],
    },
  ]

  // Sichere JSON-Daten vor XSS-Angriffen
  const safeJsonData = DOMPurify.sanitize(JSON.stringify(structuredData), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  })

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonData }}
        className="sr-only"
      />

      <section className="relative w-full pt-28 pb-12 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-80 h-80 bg-primary/15 rounded-full blur-3xl opacity-40" />
          <div className="absolute -bottom-16 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl opacity-30" />
        </div>
        <div className="relative max-w-6xl mx-auto flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-primary/70">Forum · Pro+</p>
            <h1 className="text-4xl md:text-5xl font-bold">VectoBeat community hub</h1>
            <p className="text-foreground/70 text-lg">
              Share playbooks for mixes, queue automations, and reliability fixes with the VectoBeat community. Browse topics,
              learn from the team, and post your own setups or feedback. Everyone can read; Pro+ members and VectoBeat admins/operators
              can open threads and new topics.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href={SUPPORT_DESK_LINK}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Request Pro+ Access
              </Link>
              <Link
                href={ROADMAP_LINK}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors"
              >
                View Forum Roadmap
              </Link>
            </div>
          </div>
          <div className="w-full lg:w-1/3">
            <div className="rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">How it&apos;s organized</span>
                <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-200 px-3 py-1 font-semibold">
                  Live
                </span>
              </div>
              <ul className="space-y-2 text-sm text-foreground/70">
                <li className="flex items-center gap-2">• Topic spaces for automations, sound design, and reliability</li>
                <li className="flex items-center gap-2">• Threads curated by the team with playbooks and fixes</li>
                <li className="flex items-center gap-2">• Pro+ & VectoBeat team post; guests & members read-only</li>
                <li className="flex items-center gap-2">• Moderated to keep guidance VectoBeat-focused and current</li>
              </ul>
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                Current state: public read access, Pro+/team posting, and team-moderated categories tailored to VectoBeat use cases.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="topics" className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">Categories</p>
              <h2 className="text-2xl font-semibold text-foreground">Pick your topic</h2>
              <p className="text-sm text-foreground/60">
                Automation, sound design, status & reliability, release previews, and moderation lounges — join the discussions that
                matter to your VectoBeat setup.
              </p>
            </div>
            <Link href="/support-desk" className="text-sm font-semibold text-primary hover:text-primary/80">
              Get help from the team →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {categories.map((cat, idx) => {
              const accent = accentPalette[idx % accentPalette.length]
              return (
                <div
                  key={cat.slug}
                  className="rounded-2xl border border-border/50 bg-card/40 p-5 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">Topic</p>
                      <h3 className="text-xl font-semibold text-foreground">{cat.title}</h3>
                    </div>
                    <div className={`h-10 w-10 rounded-full bg-linear-to-br ${accent} opacity-80 shadow-lg shadow-black/20`} />
                  </div>
                  <p className="mt-2 text-sm text-foreground/70">
                    {cat.description ?? `${cat.threadCount} threads`} · VectoBeat community space
                  </p>
                  <div className="flex items-center justify-between mt-4 text-xs text-foreground/60">
                    <span>{cat.threadCount} Threads</span>
                    {(() => {
                      const safeSlug = typeof cat.slug === "string" ? cat.slug.trim() : ""
                      const href = /^[A-Za-z0-9-_]+$/.test(safeSlug) ? `/forum/${safeSlug}` : "/forum"
                      return (
                        <Link href={href} className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary/80">
                          Open →
                        </Link>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Latest threads</p>
              <h3 className="text-2xl font-semibold text-foreground">Fresh from the VectoBeat community</h3>
            </div>
            <Link href="/forum#topics" className="text-sm font-semibold text-primary hover:text-primary/80">
              All topics →
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {latestThreads.map((thread) => {
              const safeCategory = typeof thread.categorySlug === "string" && /^[A-Za-z0-9-_]+$/.test(thread.categorySlug)
                ? thread.categorySlug
                : null
              const safeThreadId = typeof thread.id === "string" && /^[A-Za-z0-9-_]+$/.test(thread.id) ? thread.id : null
              const path = safeCategory && safeThreadId ? `/forum/${safeCategory}/${safeThreadId}` : "/forum"
              return (
                <div
                  key={thread.id}
                  className="rounded-2xl border border-border/50 bg-card/40 p-5 flex flex-col gap-2 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-foreground/60">
                    <span>{thread.categoryTitle ?? "Thread"}</span>
                    <span>{thread.replies} replies</span>
                  </div>
                  <h4 className="text-lg font-semibold text-foreground">{thread.title}</h4>
                  {thread.summary ? <p className="text-sm text-foreground/70 line-clamp-2">{thread.summary}</p> : null}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {thread.tags?.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] rounded-full bg-slate-500/20 text-slate-100 px-2 py-0.5 border border-slate-500/40"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-foreground/60">Status: {thread.status || "open"}</span>
                    <Link href={path} className="text-primary font-semibold hover:text-primary/80">
                      Open thread →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="w-full px-4 pb-16">
          <div className="max-w-6xl mx-auto space-y-6 rounded-2xl border border-border/60 bg-card/40 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Browse & open instantly</p>
                <h3 className="text-2xl font-semibold text-foreground">Direct access per category</h3>
                <p className="text-sm text-foreground/60">
                  Pick a category, jump into a thread, and follow along with the latest fixes and playbooks. Posting stays exclusive to
                  Pro+ members and the VectoBeat team; everyone else enjoys read-only access.
                </p>
              </div>
              <Link href={SUPPORT_DESK_LINK} className="text-sm font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-2">
                Contact support →
              </Link>
            </div>

            <ForumThreadBrowser
              discordId={viewer.discordId}
              canPost={viewer.canPost}
              canComment={viewer.canComment}
              canModerate={viewer.canModerate}
              categories={categories.map((cat) => ({ slug: cat.slug, title: cat.title }))}
              initialThreads={initialThreads}
              initialPosts={initialPosts}
              defaultCategory={defaultCategory}
            />
          </div>
        </section>
      ) : null}

      <Footer />
    </div>
  )
}
