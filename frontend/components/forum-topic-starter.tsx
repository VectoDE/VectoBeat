"use client"

import { useState } from "react"

type ForumTopicStarterProps = {
  discordId: string | null
  threadId: string | null
  onPosted?: () => void
  triggerLabel?: string
  buttonClassName?: string
  disabled?: boolean
}

export function ForumTopicStarter({
  discordId,
  threadId,
  onPosted,
  triggerLabel = "Start topic",
  buttonClassName = "px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90",
  disabled,
}: ForumTopicStarterProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const canSubmit = Boolean(discordId && threadId && title.trim() && body.trim())

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setMessage(null)
    try {
      const content = `${title.trim()}\n\n${body.trim()}`
      const response = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, threadId, body: content, role: "topic" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "failed")
      }
      setTitle("")
      setBody("")
      setMessage("Topic saved")
      setTimeout(() => setOpen(false), 200)
      setTimeout(() => window.location.reload(), 450)
      onPosted?.()
    } catch (error) {
      const reason = error instanceof Error ? error.message : "error"
      setMessage(`Could not create topic: ${reason}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || !discordId || !threadId}
        className={`${buttonClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">Start a new topic</h3>
              <button onClick={() => setOpen(false)} className="text-foreground/60 hover:text-foreground text-xl">
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground/70">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                maxLength={120}
                placeholder="What would you like to discuss?"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground/70">Description</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm h-28"
                maxLength={4000}
                placeholder="Share details, links, or checklists."
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              {message ? <span className="text-xs text-foreground/60">{message}</span> : <span />}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm text-foreground/70 hover:border-primary/40"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit || submitting}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Create topic"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
