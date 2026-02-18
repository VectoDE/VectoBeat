"use client"

import { useEffect, useState } from "react"
import { Users, UserCheck, ExternalLink } from "lucide-react"
import { apiClient } from "@/lib/api-client"

interface DiscordWidgetMember {
  status: string
}

interface DiscordWidgetResponse {
  name: string
  instant_invite: string | null
  presence_count: number
  members: DiscordWidgetMember[]
}

interface DiscordWidgetState {
  name: string
  inviteUrl: string
  onlineMembers: number
  totalMembers: number
}

export default function DiscordWidget() {
  const [widget, setWidget] = useState<DiscordWidgetState | null>(null)
  const [loading, setLoading] = useState(true)

  const DISCORD_SERVER_ID = "879435075710746684"

  useEffect(() => {
    let isMounted = true

    const fetchDiscordWidget = async () => {
      try {
        const data = await apiClient<DiscordWidgetResponse>(`https://discord.com/api/guilds/${DISCORD_SERVER_ID}/widget.json`)
        const normalizedMembers = Array.isArray(data.members) ? data.members : []
        const baseOnline = typeof data.presence_count === "number" ? data.presence_count : normalizedMembers.length

        let onlineMembers = baseOnline
        let totalMembers = Math.max(baseOnline, normalizedMembers.length)
        const inviteUrl = data.instant_invite || "https://discord.com/invite/vectobeat"

        const inviteCode = inviteUrl.split("/").filter(Boolean).pop()?.split("?")[0]
        if (inviteCode) {
          try {
            const inviteData = await apiClient<any>(
              `https://discord.com/api/v10/invites/${inviteCode}?with_counts=true&with_expiration=true`
            )
            onlineMembers = inviteData.approximate_presence_count ?? onlineMembers
            totalMembers = inviteData.approximate_member_count ?? totalMembers
          } catch (error) {
            console.error("Failed to fetch invite counts:", error)
          }
        }

        totalMembers = Math.max(totalMembers, onlineMembers)

        if (!isMounted) return

        setWidget({
          name: data.name,
          inviteUrl,
          onlineMembers,
          totalMembers,
        })
      } catch (error) {
        console.error("Failed to fetch Discord widget:", error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchDiscordWidget()
    const interval = setInterval(fetchDiscordWidget, 30000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading) {
    return (
      <div className="p-6 rounded-lg border border-border/50 bg-card/30 animate-pulse">
        <div className="h-6 w-32 bg-primary/20 rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-24 bg-primary/20 rounded" />
          <div className="h-4 w-28 bg-primary/20 rounded" />
        </div>
      </div>
    )
  }

  if (!widget) {
    return (
      <div className="p-6 rounded-lg border border-primary/20 bg-primary/5">
        <p className="text-foreground/70">Discord widget not available.</p>
      </div>
    )
  }

  return (
    <a
      href={widget.inviteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-6 rounded-lg border border-primary/30 hover:border-primary/50 bg-card/30 hover:bg-card/50 transition-all duration-300 group cursor-pointer transform hover:scale-105"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-primary mb-1 group-hover:text-primary/80 transition-colors">
            {widget.name}
          </h3>
          <p className="text-sm text-foreground/60">Join our Discord community.</p>
        </div>
        <ExternalLink className="w-5 h-5 text-primary/60 group-hover:text-primary transition-colors" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-primary" />
            <span className="text-xs text-foreground/60">Online now</span>
          </div>
          <div className="text-2xl font-bold text-primary">{widget.onlineMembers.toLocaleString()}</div>
        </div>

        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs text-foreground/60">Total members</span>
          </div>
          <div className="text-2xl font-bold text-primary">{widget.totalMembers.toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-primary/20 text-center">
        <span className="inline-flex items-center gap-2 text-sm text-primary font-semibold group-hover:gap-3 transition-all">
          Join server
          <ExternalLink className="w-4 h-4" />
        </span>
      </div>
    </a>
  )
}
