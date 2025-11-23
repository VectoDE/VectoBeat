"use client"

import { useEffect } from "react"
import { BLOG_SESSION_EVENT } from "@/lib/blog-session"

interface BlogSessionBootstrapProps {
  initialToken?: string | null
  initialDiscordId?: string | null
}

export function BlogSessionBootstrap({ initialToken = null, initialDiscordId = null }: BlogSessionBootstrapProps) {
  useEffect(() => {
    if (typeof window === "undefined") return

    const dispatchSession = (token: string, discordId: string) => {
      window.dispatchEvent(
        new CustomEvent<{ token: string; discordId: string }>(BLOG_SESSION_EVENT, {
          detail: { token, discordId },
        }),
      )
    }

    const persistSession = (token: string, discordId: string) => {
      const storedToken = localStorage.getItem("discord_token")
      const storedDiscordId = localStorage.getItem("discord_user_id")
      if (storedToken === token && storedDiscordId === discordId) {
        return
      }
      localStorage.setItem("discord_token", token)
      localStorage.setItem("discord_user_id", discordId)
      dispatchSession(token, discordId)
    }

    const url = new URL(window.location.href)
    const tokenFromUrl = url.searchParams.get("token")
    const discordIdFromUrl = url.searchParams.get("user_id")

    if (tokenFromUrl && discordIdFromUrl) {
      persistSession(tokenFromUrl, discordIdFromUrl)
      url.searchParams.delete("token")
      url.searchParams.delete("user_id")
      const cleanedPath = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}${url.hash}`
      window.history.replaceState({}, document.title, cleanedPath)
      return
    }

    if (initialToken && initialDiscordId) {
      persistSession(initialToken, initialDiscordId)
    }
  }, [initialDiscordId, initialToken])

  return null
}

export { BLOG_SESSION_EVENT } from "@/lib/blog-session"
