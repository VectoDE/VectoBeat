"use client"

import { useState, type FormEvent } from "react"

type Category = { slug: string; title: string }

export function ForumComposer({
  discordId,
  categories,
  onCreated,
}: {
  discordId: string
  categories: Category[]
  onCreated?: () => void
}) {
  const [category, setCategory] = useState(categories[0]?.slug ?? "")
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [tags, setTags] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reset = () => {
    setTitle("")
    setSummary("")
    setTags("")
    setBody("")
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch("/api/forum/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId,
          category,
          title,
          summary,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          body,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "failed")
      }
      setMessage("Thread erstellt. Wir laden neu ...")
      reset()
      onCreated?.()
      // Reload to show fresh data with minimal effort
      setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Fehler"
      setMessage(`Konnte Thread nicht erstellen: ${reason}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card/40 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary/60">Start a new thread</p>
          <h3 className="text-xl font-semibold text-foreground">Share a playbook or ask a question</h3>
        </div>
        <span className="text-xs rounded-full bg-emerald-500/10 text-emerald-200 px-3 py-1 border border-emerald-500/30">
          Pro+ poster
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            required
          >
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            maxLength={200}
            required
            placeholder="e.g. Loudness presets for Queue Copilots"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">Short description</span>
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          maxLength={400}
          placeholder="What is it about? (optional)"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">Tags</span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          maxLength={120}
          placeholder="playbook, automations, reliability"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground/70">Post</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm h-32"
          maxLength={5000}
          required
          placeholder="Share details, checklists, or ask your question."
        />
      </label>
      <div className="flex items-center justify-between">
        {message && <p className="text-xs text-foreground/60">{message}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Publish thread"}
        </button>
      </div>
    </form>
  )
}

export function ForumReplyBox({
  discordId,
  threadId,
  onPosted,
}: {
  discordId: string
  threadId: string
  onPosted?: () => void
}) {
  const [body, setBody] = useState("")
  const [posting, setPosting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPosting(true)
    setMessage(null)
    try {
      const response = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, threadId, body }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "failed")
      }
      setBody("")
      setMessage("Reply saved.")
      onPosted?.()
      setTimeout(() => window.location.reload(), 400)
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Error"
      setMessage(`Reply failed: ${reason}`)
    } finally {
      setPosting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-3">
      <label className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-foreground/50">Reply</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm h-24"
          maxLength={5000}
          required
          placeholder="Teile deine Learnings oder stelle eine Rückfrage."
        />
      </label>
      <div className="flex items-center justify-between">
        {message && <span className="text-xs text-foreground/60">{message}</span>}
        <button
          type="submit"
          disabled={posting}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/90 disabled:opacity-60"
        >
          {posting ? "Sende..." : "Antwort posten"}
        </button>
      </div>
    </form>
  )
}
