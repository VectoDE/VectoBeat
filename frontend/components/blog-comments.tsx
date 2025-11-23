"use client"

import { useEffect, useState } from "react"
import type { BlogComment } from "@/lib/db"
import { useBlogSession } from "@/hooks/use-blog-session"
import { buildDiscordLoginUrl } from "@/lib/config"

interface BlogCommentsProps {
  postIdentifier: string
  initialComments: BlogComment[]
}

export function BlogComments({ postIdentifier, initialComments }: BlogCommentsProps) {
  const session = useBlogSession()
  const isAuthenticated = session.status === "authenticated" && !!session.token && !!session.discordId
  const [comments, setComments] = useState<BlogComment[]>(initialComments)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setLoginUrl(buildDiscordLoginUrl(window.location.href))
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!isAuthenticated || !session.token || !session.discordId) {
      setError("Please sign in first.")
      return
    }

    if (!message.trim()) {
      setError("Please enter a comment.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/blog/${postIdentifier}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          author: session.username ?? "Community Member",
          message,
          discordId: session.discordId,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save your comment.")
      }
      if (payload.comment) {
        setComments((prev) => [payload.comment as BlogComment, ...prev])
        setMessage("")
        setSuccess("Thanks for sharing your thoughts!")
      }
    } catch (err) {
      console.error("Failed to submit comment", err)
      setError(err instanceof Error ? err.message : "Unknown error. Please retry.")
    } finally {
      setSubmitting(false)
      setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 5000)
    }
  }

  return (
    <div className="border border-border/40 rounded-2xl p-6 bg-card/40 backdrop-blur mt-16">
      <h2 className="text-2xl font-semibold mb-2">Comments</h2>
      <p className="text-sm text-foreground/60 mb-6">
        Share your thoughts—questions, requests, and feedback are all welcome.
      </p>

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-foreground/60">
            Signed in as <span className="font-semibold text-foreground">{session.username}</span>
          </p>
          <div>
            <label htmlFor="comment-message" className="block text-sm font-medium text-foreground/80 mb-1">
              Comment
            </label>
            <textarea
              id="comment-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[120px]"
              maxLength={2000}
              placeholder="What would you like to share?"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Post comment"}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}
        </form>
      ) : (
        <div className="border border-dashed border-border/60 rounded-lg p-4 bg-background/40 text-sm text-foreground/70">
          <p className="mb-3">You need to be signed in to write a comment.</p>
          {loginUrl && (
            <a
              href={loginUrl}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90"
            >
              Sign in with Discord
            </a>
          )}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {comments.length === 0 && <p className="text-foreground/60 text-sm">No comments yet.</p>}
        {comments.map((comment) => (
          <div key={comment.id} className="border border-border/30 rounded-xl p-4 bg-background/40">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">{comment.author}</p>
              <p className="text-xs text-foreground/60">
                {new Date(comment.createdAt).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <p className="text-foreground/80 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
