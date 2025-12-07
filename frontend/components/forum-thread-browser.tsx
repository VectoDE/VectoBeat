"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { ForumReplyBox } from "./forum-actions"
import { ForumTopicStarter } from "./forum-topic-starter"

const safeSegment = (value: string) => {
  const raw = typeof value === "string" ? value.trim() : ""
  if (/^[A-Za-z0-9-_]+$/.test(raw)) return raw
  try {
    return encodeURIComponent(raw)
  } catch {
    return ""
  }
}

type Category = { title: string; slug: string }
type Thread = {
  id: string
  categorySlug?: string | null
  categoryTitle?: string | null
  title: string
  summary?: string | null
  replies: number
  tags: string[]
  createdAt?: string
  status?: string
}

type Post = {
  id: string
  threadId: string
  authorId?: string | null
  authorName?: string | null
  role?: string
  body: string
  createdAt: string
}

export function ForumThreadBrowser({
  discordId,
  canPost,
  canComment,
  categories,
  initialThreads,
  initialPosts,
  defaultCategory,
}: {
  discordId: string | null
  canPost: boolean
  canComment: boolean
  categories: Category[]
  initialThreads: Thread[]
  initialPosts: Post[]
  defaultCategory?: string | null
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>(() => defaultCategory || categories[0]?.slug || "")
  const [threads, setThreads] = useState<Thread[]>(initialThreads)
  const [selectedThreadId, setSelectedThreadId] = useState<string>(() => initialThreads[0]?.id || "")
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({})

  const threadsByCategory = useMemo(() => {
    const grouped: Record<string, Thread[]> = {}
    threads.forEach((thread) => {
      const slug = thread.categorySlug || "uncategorized"
      if (!grouped[slug]) grouped[slug] = []
      grouped[slug].push(thread)
    })
    return grouped
  }, [threads])

  useEffect(() => {
    if (!selectedCategory) return
    const fetchThreads = async () => {
      setLoadingThreads(true)
      try {
        const url = new URL("/api/forum/threads", window.location.origin)
        if (discordId) url.searchParams.set("discordId", discordId)
        url.searchParams.set("category", selectedCategory)
        const response = await fetch(url.toString(), { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (Array.isArray(payload.threads)) {
          setThreads(payload.threads)
          const first = payload.threads[0]
          if (first?.id) {
            setSelectedThreadId(first.id)
            setPosts(payload.posts ?? [])
          } else {
            setSelectedThreadId("")
            setPosts([])
          }
        }
      } catch (error) {
        console.error("[VectoBeat] Failed to load threads:", error)
      } finally {
        setLoadingThreads(false)
      }
    }
    void fetchThreads()
  }, [selectedCategory, discordId])

  useEffect(() => {
    if (!selectedThreadId) return
    const fetchPosts = async () => {
      setLoadingPosts(true)
      try {
        const url = new URL("/api/forum/threads", window.location.origin)
        if (discordId) url.searchParams.set("discordId", discordId)
        url.searchParams.set("threadId", selectedThreadId)
        const response = await fetch(url.toString(), { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (Array.isArray(payload.posts)) {
          setPosts(payload.posts)
        }
      } catch (error) {
        console.error("[VectoBeat] Failed to load posts:", error)
      } finally {
        setLoadingPosts(false)
      }
    }
    void fetchPosts()
  }, [selectedThreadId, discordId])

  const currentThreads = threadsByCategory[selectedCategory] ?? []
  const currentThread = currentThreads.find((t) => t.id === selectedThreadId) || currentThreads[0]
  const safeCategorySlug = currentThread?.categorySlug ? safeSegment(currentThread.categorySlug) : ""
  const safeThreadId = currentThread?.id ? safeSegment(currentThread.id) : ""
  const threadHref = safeCategorySlug && safeThreadId ? `/forum/${safeCategorySlug}/${safeThreadId}` : "/forum"

  const addReaction = (postId: string, emoji: string) => {
    setReactionCounts((prev) => {
      const key = `${postId}:${emoji}`
      return { ...prev, [key]: (prev[key] ?? 0) + 1 }
    })
  }

  return (
    <div className="grid lg:grid-cols-[1.1fr_1.2fr] gap-6">
      <div className="rounded-2xl border border-border/50 bg-card/40 p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                selectedCategory === cat.slug
                  ? "bg-primary text-primary-foreground border-primary/60"
                  : "bg-card text-foreground/80 border-border hover:border-primary/40"
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {loadingThreads && <p className="text-sm text-foreground/60">Loading threads…</p>}
          {!loadingThreads && currentThreads.length === 0 ? (
            <p className="text-sm text-foreground/60">No threads in this category yet.</p>
          ) : null}
          {currentThreads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                thread.id === selectedThreadId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/50 bg-card/30 hover:border-primary/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{thread.title}</p>
                  {thread.summary ? <p className="text-sm text-foreground/60 line-clamp-2">{thread.summary}</p> : null}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {thread.tags?.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] rounded-full bg-slate-500/20 text-slate-100 px-2 py-0.5 border border-slate-500/40"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-foreground/60">{thread.replies} replies</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/40 p-4 space-y-4">
        {currentThread ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary/60">{currentThread.categoryTitle || "Thread"}</p>
                <h3 className="text-xl font-semibold text-foreground">{currentThread.title}</h3>
                {currentThread.summary ? <p className="text-sm text-foreground/70">{currentThread.summary}</p> : null}
                {currentThread.categorySlug ? (
                  <Link href={threadHref} className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 mt-2">
                    Open full view →
                  </Link>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {canPost ? (
                  <ForumTopicStarter discordId={discordId} threadId={currentThread.id} />
                ) : null}
                <span className="text-xs rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30">
                  {currentThread.status || "Open"}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {loadingPosts && <p className="text-sm text-foreground/60">Loading replies…</p>}
              {!loadingPosts && posts.length === 0 ? (
                <p className="text-sm text-foreground/60">No replies yet. Start the conversation!</p>
              ) : null}
              {posts.map((post) => (
                <div key={post.id} className="rounded-lg border border-border/40 bg-card/30 p-3">
                  <div className="flex items-center justify-between text-xs text-foreground/60">
                    <span>
                      {post.authorName || "Member"} · {post.role || "member"}
                    </span>
                    <span>{new Date(post.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/80 whitespace-pre-line">{post.body}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-foreground/60">
                {["👍", "🎵", "🔥"].map((emoji) => {
                  const key = `${post.id}:${emoji}`
                  const count = reactionCounts[key] ?? 0
                  return (
                    <button
                          key={emoji}
                          type="button"
                          onClick={() => addReaction(post.id, emoji)}
                          className="px-2 py-1 rounded-full border border-border/40 hover:border-primary/40"
                        >
                          {emoji} {count || ""}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {canComment && currentThread.id ? (
              <ForumReplyBox
                discordId={discordId ?? ""}
                threadId={currentThread.id}
                onPosted={() => {
                  // reload posts
                  setSelectedThreadId(currentThread.id)
                }}
              />
            ) : (
              <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-xs text-foreground/60">
                Sign in to comment.
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground/60">Choose a category to browse threads.</p>
        )}
      </div>
    </div>
  )
}
