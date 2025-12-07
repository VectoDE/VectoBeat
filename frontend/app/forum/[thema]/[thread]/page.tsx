import Link from "next/link"
import { notFound } from "next/navigation"

import Footer from "@/components/footer"
import Navigation from "@/components/navigation"
import { ForumReplyBox } from "@/components/forum-actions"
import { ForumTopicStarter } from "@/components/forum-topic-starter"
import { listForumCategories, listForumPosts, listForumThreads } from "@/lib/db"
import { getForumViewerContext, resolveForumParams } from "../../utils"

type Params = { thema: string; thread: string }

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  } catch {
    return value
  }
}

const safeSegment = (value: string) => {
  const raw = typeof value === "string" ? value.trim() : ""
  if (/^[A-Za-z0-9-_]+$/.test(raw)) return raw
  try {
    return encodeURIComponent(raw)
  } catch {
    return ""
  }
}

export default async function ForumThreadPage({ params }: { params: Promise<Params> | Params }) {
  const { thema, thread } = await resolveForumParams(params)
  const categorySlug = decodeURIComponent(thema)
  const threadId = decodeURIComponent(thread)

  const [viewer, categories, threads] = await Promise.all([
    getForumViewerContext(),
    listForumCategories(),
    listForumThreads(categorySlug),
  ])

  const category = categories.find((entry) => entry.slug === categorySlug)
  if (!category) {
    notFound()
  }

  const currentThread = threads.find((entry) => entry.id === threadId)
  if (!currentThread) {
    notFound()
  }

  const posts = await listForumPosts(currentThread.id)

  const otherThreads = threads.filter((entry) => entry.id !== currentThread.id).slice(0, 6)
  const safeCategorySlug = safeSegment(category.slug)
  const safeThreadId = safeSegment(currentThread.id)
  const safeCategoryPath = safeCategorySlug ? `/forum/${safeCategorySlug}` : "/forum"
  const safeThreadPath = safeCategorySlug && safeThreadId ? `/forum/${safeCategorySlug}/${safeThreadId}` : "/forum"
  const buildThreadPath = (id: string) => {
    const safeId = safeSegment(id)
    return safeCategorySlug && safeId ? `/forum/${safeCategorySlug}/${safeId}` : safeCategoryPath
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="w-full px-4 pt-24 pb-10 bg-linear-to-b from-primary/5 via-background to-background">
        <div className="max-w-6xl mx-auto space-y-3">
          <div className="text-xs text-foreground/60 flex items-center gap-2">
            <Link href="/forum" className="hover:text-primary font-semibold">
              Forum
            </Link>
            <span>/</span>
            <Link href={safeCategoryPath} className="hover:text-primary font-semibold">
              {category.title}
            </Link>
            <span>/</span>
            <span className="text-foreground">Thread</span>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70">{safeThreadPath}</p>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">{currentThread.title}</h1>
            {currentThread.summary ? <p className="text-foreground/70 text-base md:text-lg">{currentThread.summary}</p> : null}
            <div className="flex items-center flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30">
                {currentThread.replies} replies
              </span>
              <span className="rounded-full bg-slate-500/10 text-slate-200 px-3 py-1 border border-slate-500/30 capitalize">
                Status: {currentThread.status || "open"}
              </span>
              {currentThread.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] rounded-full bg-slate-500/20 text-slate-100 px-2 py-0.5 border border-slate-500/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Posts</p>
                  <h2 className="text-xl font-semibold text-foreground">Inside this thread</h2>
                </div>
                {viewer.canPost ? (
                  <ForumTopicStarter
                    discordId={viewer.discordId}
                    threadId={currentThread.id}
                    triggerLabel="New topic"
                    buttonClassName="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                  />
                ) : null}
              </div>
              <div className="space-y-3">
                {posts.length === 0 ? (
                  <p className="text-sm text-foreground/60">No replies yet. Start the conversation.</p>
                ) : null}
                {posts.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border/40 bg-card/30 p-3">
                    <div className="flex items-center justify-between text-xs text-foreground/60">
                      <span>
                        {post.authorName || "Member"} · {post.role || "member"}
                      </span>
                      <span>{formatDate(post.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-foreground/80 whitespace-pre-line">{post.body}</p>
                  </div>
                ))}
              </div>
              {viewer.canComment ? (
                <div className="mt-4">
                  <ForumReplyBox discordId={viewer.discordId ?? ""} threadId={currentThread.id} />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-xs text-foreground/60 mt-4">
                  Sign in to reply.
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-3">
              <h3 className="text-lg font-semibold text-foreground">More from {category.title}</h3>
              {otherThreads.length === 0 ? <p className="text-sm text-foreground/60">No more threads.</p> : null}
              <div className="space-y-2">
                {otherThreads.map((entry) => (
                  <Link
                    key={entry.id}
                    href={buildThreadPath(entry.id)}
                    className="block rounded-lg border border-border/40 bg-card/20 px-3 py-2 hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-semibold text-foreground line-clamp-1">{entry.title}</p>
                    {entry.summary ? <p className="text-xs text-foreground/60 line-clamp-2">{entry.summary}</p> : null}
                  </Link>
                ))}
              </div>
              <Link
                href={safeCategoryPath}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
              >
                Back to {safeCategoryPath} →
              </Link>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/30 p-4 text-sm text-foreground/70 space-y-2">
              <p>• Public readers see everything; replies require sign-in.</p>
              <p>• Pro+ can start topics; the team moderates for VectoBeat quality and safety.</p>
              <p>• Every reply lives at /forum/{category.slug}/{currentThread.id} so you can link discussions easily.</p>
            </div>
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  )
}
