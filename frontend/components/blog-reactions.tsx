"use client"

import { useCallback, useEffect, useState } from "react"
import { ThumbsDown, ThumbsUp } from "lucide-react"
import type { BlogReactionSummary } from "@/lib/db"
import { buildDiscordLoginUrl } from "@/lib/config"
import { useBlogSession } from "@/hooks/use-blog-session"
import { apiClient } from "@/lib/api-client"

interface BlogReactionsProps {
  postIdentifier: string
  initialReactions: BlogReactionSummary
}

export function BlogReactions({ postIdentifier, initialReactions }: BlogReactionsProps) {
  const session = useBlogSession()
  const isAuthenticated = session.status === "authenticated" && !!session.token && !!session.discordId
  const [counts, setCounts] = useState<BlogReactionSummary>(initialReactions)
  const [userReaction, setUserReaction] = useState<"up" | "down" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setLoginUrl(buildDiscordLoginUrl(window.location.href))
  }, [])

  useEffect(() => {
    setCounts(initialReactions)
  }, [initialReactions])

  useEffect(() => {
    const controller = new AbortController()

    const loadReactions = async () => {
      if (!isAuthenticated || !session.token || !session.discordId) {
        setUserReaction(null)
        return
      }
      try {
        const payload = await apiClient<any>(
          `/api/blog/${postIdentifier}/reactions?discordId=${encodeURIComponent(session.discordId)}`,
          {
            headers: { Authorization: `Bearer ${session.token}` },
            cache: "no-store",
            signal: controller.signal,
          },
        )
        if (payload.reactions) {
          setCounts(payload.reactions)
        }
        if (payload.userReaction === "up" || payload.userReaction === "down") {
          setUserReaction(payload.userReaction)
        } else {
          setUserReaction(null)
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to load reactions", error)
        }
      }
    }

    void loadReactions()

    return () => controller.abort()
  }, [isAuthenticated, postIdentifier, session.discordId, session.token])

  const handleReact = useCallback(
    async (reaction: "up" | "down") => {
      if (!isAuthenticated || !session.token || !session.discordId) {
        setStatusMessage("Please sign in first.")
        return
      }
      if (userReaction) {
        setStatusMessage("You have already reacted to this post.")
        return
      }
      if (submitting) return
      setSubmitting(true)
      setStatusMessage(null)
      try {
        const payload = await apiClient<any>(`/api/blog/${postIdentifier}/reactions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ reaction, discordId: session.discordId }),
        })
        if (payload?.reactions) {
          setCounts(payload.reactions)
        }
        if (payload?.userReaction === "up" || payload?.userReaction === "down") {
          setUserReaction(payload.userReaction)
        }
        if (payload?.alreadyReacted) {
          setStatusMessage("You have already reacted to this post.")
        } else {
          setStatusMessage("Thanks for the feedback!")
        }
      } catch (error) {
        console.error("Failed to submit reaction", error)
        setStatusMessage(error instanceof Error ? error.message : "Unable to process reaction.")
      } finally {
        setSubmitting(false)
      }
    },
    [isAuthenticated, postIdentifier, session.discordId, session.token, submitting, userReaction],
  )

  return (
    <div className="border border-border/40 rounded-xl px-4 py-5 bg-card/30 backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-foreground/60">Reactions</p>
          <p className="text-foreground/80 text-sm">{counts.up + counts.down} total - share your feedback</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => handleReact("up")}
          disabled={submitting || !isAuthenticated || !!userReaction}
          className={[
            "flex items-center justify-between rounded-lg border px-4 py-3 transition",
            userReaction === "up"
              ? "border-primary/70 bg-primary/10 text-primary"
              : "border-border/50 hover:border-primary/50 text-foreground/80",
            !isAuthenticated || userReaction ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <span className="flex items-center gap-2 font-semibold">
            <ThumbsUp size={18} />
            Helpful
          </span>
          <span className="text-sm">{counts.up}</span>
        </button>

        <button
          type="button"
          onClick={() => handleReact("down")}
          disabled={submitting || !isAuthenticated || !!userReaction}
          className={[
            "flex items-center justify-between rounded-lg border px-4 py-3 transition",
            userReaction === "down"
              ? "border-red-500/60 bg-red-500/10 text-red-400"
              : "border-border/50 hover:border-red-500/40 text-foreground/80",
            !isAuthenticated || userReaction ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <span className="flex items-center gap-2 font-semibold">
            <ThumbsDown size={18} />
            Needs work
          </span>
          <span className="text-sm">{counts.down}</span>
        </button>
      </div>

      {!isAuthenticated && (
        <p className="text-xs text-foreground/60 mt-4">
          Please{" "}
          {loginUrl ? (
            <a href={loginUrl} className="text-primary underline decoration-dotted underline-offset-4">
              sign in with Discord
            </a>
          ) : (
            "sign in with Discord"
          )}{" "}
          to react.
        </p>
      )}

      {statusMessage && <p className="text-xs text-foreground/60 mt-3">{statusMessage}</p>}
    </div>
  )
}
