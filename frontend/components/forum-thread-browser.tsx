"use client"

import { useEffect, useMemo, useState } from "react"
import { ForumReplyBox } from "./forum-actions"

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
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [topicTitle, setTopicTitle] = useState("")
  const [topicBody, setTopicBody] = useState("")
  const [topicSubmitting, setTopicSubmitting] = useState(false)
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

  const addReaction = (postId: string, emoji: string) => {
    setReactionCounts((prev) => {
      const key = `${postId}:${emoji}`
      return { ...prev, [key]: (prev[key] ?? 0) + 1 }
    })
  }

  const submitTopic = async () => {
    if (!discordId || !currentThread?.id || !topicTitle.trim() || !topicBody.trim()) return
    setTopicSubmitting(true)
    try {
      const content = `${topicTitle.trim()}\n\n${topicBody.trim()}`
      const response = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, threadId: currentThread.id, body: content, role: "topic" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "failed")
      }
      setTopicTitle("")
      setTopicBody("")
      setShowTopicModal(false)
      setSelectedThreadId(currentThread.id)
    } catch (error) {
      console.error("[VectoBeat] Failed to create topic:", error)
    } finally {
      setTopicSubmitting(false)
    }
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
              </div>
              <div className="flex items-center gap-2">
                {canPost ? (
                  <button
                    onClick={() => setShowTopicModal(true)}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                  >
                    Start topic
                  </button>
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
      {showTopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowTopicModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">New topic in this thread</h3>
              <button onClick={() => setShowTopicModal(false)} className="text-foreground/60 hover:text-foreground text-xl">
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">Title</span>
              <input
                value={topicTitle}
                onChange={(e) => setTopicTitle(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                maxLength={120}
                placeholder="What do you want to discuss?"
              />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">Description</span>
              <textarea
                value={topicBody}
                onChange={(e) => setTopicBody(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm h-28"
                maxLength={4000}
                placeholder="Share details, attachments, or context."
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowTopicModal(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-foreground/70 hover:border-primary/40"
              >
                Cancel
              </button>
              <button
                onClick={submitTopic}
                disabled={topicSubmitting || !topicTitle.trim() || !topicBody.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {topicSubmitting ? "Saving..." : "Create topic"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
