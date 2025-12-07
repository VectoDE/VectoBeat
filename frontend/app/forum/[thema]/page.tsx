import Link from "next/link"
import { notFound } from "next/navigation"

import Footer from "@/components/footer"
import Navigation from "@/components/navigation"
import { ForumComposer } from "@/components/forum-actions"
import { listForumCategories, listForumThreads } from "@/lib/db"
import { getForumViewerContext, resolveForumParams } from "../utils"

type Params = { thema: string }

const safeSegment = (value: string) => {
  const raw = typeof value === "string" ? value.trim() : ""
  if (/^[A-Za-z0-9-_]+$/.test(raw)) return raw
  try {
    return encodeURIComponent(raw)
  } catch {
    return ""
  }
}

export default async function ForumCategoryPage({ params }: { params: Promise<Params> | Params }) {
  const { thema } = await resolveForumParams(params)
  const slug = decodeURIComponent(thema)

  const [viewer, categories, threads] = await Promise.all([
    getForumViewerContext(),
    listForumCategories(),
    listForumThreads(slug),
  ])

  const category = categories.find((entry) => entry.slug === slug)
  if (!category) {
    notFound()
  }

  const composerCategories = [category, ...categories.filter((entry) => entry.slug !== category.slug)]
  const safeCategorySlug = safeSegment(category.slug)
  const safeCategoryPath = safeCategorySlug ? `/forum/${safeCategorySlug}` : "/forum"
  const buildThreadPath = (id: string) => {
    const safeId = safeSegment(id)
    return safeCategorySlug && safeId ? `/forum/${safeCategorySlug}/${safeId}` : safeCategoryPath
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="w-full px-4 pt-24 pb-10 bg-linear-to-b from-primary/5 via-background to-background">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <div className="text-xs text-foreground/60 flex items-center gap-2">
            <Link href="/forum" className="hover:text-primary font-semibold">
              Forum
            </Link>
            <span>/</span>
            <span className="text-foreground">{category.title}</span>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">{safeCategoryPath}</p>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">{category.title}</h1>
            <p className="text-foreground/70 text-base md:text-lg">
              {category.description ?? "VectoBeat discussions, playbooks, and troubleshooting threads for this category."}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/60">
              <span className="rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30">
                {category.threadCount} Threads
              </span>
              <span className="rounded-full bg-slate-500/10 text-slate-200 px-3 py-1 border border-slate-500/30">
                Pro+ can post · everyone reads and learns
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Threads</p>
              <h2 className="text-xl font-semibold text-foreground">Discussions in this topic</h2>
              <p className="text-sm text-foreground/60">
                Pick a thread under {safeCategoryPath}/&lt;thread&gt; to swap setups, fixes, and ideas.
              </p>
            </div>
            <Link href="/forum#topics" className="text-sm font-semibold text-primary hover:text-primary/80">
              Back to overview →
            </Link>
              </div>

              <div className="space-y-3">
                {threads.length === 0 ? (
                  <p className="text-sm text-foreground/60">No threads in this category yet.</p>
                ) : null}
                {threads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={buildThreadPath(thread.id)}
                    className="block rounded-xl border border-border/50 bg-card/30 px-4 py-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{thread.title}</p>
                        {thread.summary ? (
                          <p className="text-xs text-foreground/60 line-clamp-2">{thread.summary}</p>
                        ) : null}
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
                      </div>
                      <div className="text-right text-xs text-foreground/60">
                        <p>{thread.replies} replies</p>
                        <p className="mt-1 capitalize">Status: {thread.status || "open"}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

              <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Andere Themen</h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    (() => {
                      const safeSlug = safeSegment(cat.slug)
                      const href = safeSlug ? `/forum/${safeSlug}` : "/forum"
                      return (
                        <Link
                          key={cat.slug}
                          href={href}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                            cat.slug === category.slug
                              ? "bg-primary text-primary-foreground border-primary/60"
                              : "bg-card text-foreground/80 border-border hover:border-primary/40"
                          }`}
                        >
                          {cat.title}
                        </Link>
                      )
                    })()
                  ))}
                </div>
              </div>
          </div>

          <div className="space-y-4">
            {viewer.canPost ? (
              <ForumComposer discordId={viewer.discordId ?? ""} categories={composerCategories} />
            ) : (
              <div className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Start your own threads</h3>
                <p className="text-sm text-foreground/60">
                  Sign in and upgrade to Pro+ to open threads directly in {safeCategoryPath}.
                </p>
                <div className="flex items-center gap-3 text-sm">
                  <Link href="/account" className="text-primary font-semibold hover:text-primary/80">
                    Sign in
                  </Link>
                  <span className="text-foreground/50">·</span>
                  <Link href="/pricing" className="text-primary font-semibold hover:text-primary/80">
                    View plans
                  </Link>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-border/60 bg-card/30 p-4 space-y-2 text-sm text-foreground/70">
              <p>• All readers: read-only access</p>
              <p>• Pro+: create threads and topics</p>
              <p>• Team: curate and moderate</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
