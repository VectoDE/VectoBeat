import { apiClient } from "@/lib/api-client"

type GuildPreview = {
  id: string
  name: string
  hasBot?: boolean
  isAdmin?: boolean
}

export type LinkedAccount = {
  id: string
  provider: string
  handle: string
  metadata?: Record<string, unknown> | null
}

export type PublicProfile = {
  handle: string
  displayName: string
  username?: string | null
  role?: string | null
  headline?: string | null
  bio?: string | null
  location?: string | null
  website?: string | null
  avatarUrl?: string | null
  membershipCount?: number | null
  totalGuildCount?: number | null
  adminGuildCount?: number | null
  botGuildCount?: number | null
  activeGuildCount?: number | null
  activeGuilds?: GuildPreview[]
  adminGuilds?: GuildPreview[]
  memberGuilds?: GuildPreview[]
  totalGuildSamples?: GuildPreview[]
  linkedAccounts?: LinkedAccount[]
}

export type ProfileFetchResult = PublicProfile | { restricted: true } | null

const resolveBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "")

export const fetchPublicProfile = async (slug: string): Promise<ProfileFetchResult> => {
  if (!slug?.trim()) return null

  try {
    return await apiClient<any>(`${resolveBaseUrl()}/api/profile/${slug}`, {
      cache: "no-store",
    })
  } catch (error) {
    return null
  }
}

export const buildProfilePageUrl = (handle: string) => `${resolveBaseUrl()}/profile/${handle}`

export const buildProfileSeoDescription = (profile: PublicProfile) => {
  const name = profile.displayName || profile.username || profile.handle
  const headline = profile.headline?.trim()
  const location = profile.location?.trim()
  const memberCount = profile.membershipCount ?? profile.totalGuildCount ?? 0
  const websiteHost = profile.website
    ? (() => {
        try {
          return new URL(profile.website).hostname
        } catch {
          return null
        }
      })()
    : null

  const parts = [
    headline,
    memberCount > 0 ? `${memberCount} Discord server${memberCount === 1 ? "" : "s"} powered by VectoBeat` : null,
    location ? `Based in ${location}` : null,
    websiteHost ? `More at ${websiteHost}` : null,
  ].filter(Boolean)

  const summary = parts.length ? parts.join(" • ") : "Explore their Discord automations, music flows, and bot installs."
  return `${name} (@${profile.handle}) on VectoBeat. ${summary}`
}

export const buildProfileKeywords = (profile: PublicProfile) => {
  const keywords = new Set<string>([
    `${profile.handle} VectoBeat`,
    `${profile.displayName ?? profile.handle} Discord`,
    "VectoBeat profile",
    "Discord music bot creator",
    "Discord automation",
    "Discord analytics",
  ])

  if (profile.headline) {
    keywords.add(profile.headline)
  }
  if (profile.location) {
    keywords.add(`community lead ${profile.location}`)
  }

  return Array.from(keywords)
}
