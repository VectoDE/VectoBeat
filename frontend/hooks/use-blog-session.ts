"use client"

import { useEffect, useState } from "react"
import { BLOG_SESSION_EVENT } from "@/lib/blog-session"

type SessionStatus = "loading" | "authenticated" | "unauthenticated"

export interface BlogSessionState {
  status: SessionStatus
  token: string | null
  discordId: string | null
  username: string | null
}

const unauthenticatedState: BlogSessionState = {
  status: "unauthenticated",
  token: null,
  discordId: null,
  username: null,
}

declare global {
  interface Window {
    __vectobeatBlogSession?: BlogSessionState
  }
}

export const useBlogSession = () => {
  const [session, setSession] = useState<BlogSessionState>(() => {
    if (typeof window !== "undefined" && window.__vectobeatBlogSession) {
      return window.__vectobeatBlogSession
    }
    return { status: "loading", token: null, discordId: null, username: null }
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    let cancelled = false

    const applyState = (next: BlogSessionState) => {
      if (cancelled) return
      window.__vectobeatBlogSession = next
      setSession(next)
    }

    const clearSession = () => {
      localStorage.removeItem("discord_token")
      localStorage.removeItem("discord_user_id")
      applyState(unauthenticatedState)
    }

    const verify = async (token: string, discordId: string) => {
      try {
        const response = await fetch("/api/verify-session", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error("Session verification failed")
        }

        const data = await response.json()

        if (data?.authenticated) {
          applyState({
            status: "authenticated",
            token,
            discordId,
            username: data.displayName || data.username || "Community Member",
          })
          return
        }
      } catch (error) {
        console.error("[VectoBeat] Blog session check failed:", error)
      }

      clearSession()
    }

    const bootstrap = (override?: { token?: string | null; discordId?: string | null }) => {
      const token = override?.token ?? localStorage.getItem("discord_token")
      const discordId = override?.discordId ?? localStorage.getItem("discord_user_id")

      if (!token || !discordId) {
        clearSession()
        return
      }

      applyState({
        status: "loading",
        token,
        discordId,
        username: null,
      })
      void verify(token, discordId)
    }

    const cached = window.__vectobeatBlogSession
    if (cached) {
      applyState(cached)
      if (cached.status === "authenticated") {
        // still register listener for future updates
      }
    } else {
      applyState({ status: "loading", token: null, discordId: null, username: null })
    }

    bootstrap()

    const handleSessionRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string | null; discordId?: string | null }>).detail
      bootstrap(detail)
    }

    window.addEventListener(BLOG_SESSION_EVENT, handleSessionRefresh)

    return () => {
      cancelled = true
      window.removeEventListener(BLOG_SESSION_EVENT, handleSessionRefresh)
    }
  }, [])

  return session
}
