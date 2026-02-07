import type { ComponentType } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import { Link as LinkIcon } from "lucide-react"
import {
  SiDiscord,
  SiFaceit,
  SiGithub,
  SiGitlab,
  SiInstagram,
  SiSlack,
  SiSteam,
  SiTiktok,
  SiTwitch,
  SiX,
  SiYoutube,
} from "react-icons/si"
import { FaMicrosoft } from "react-icons/fa"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { buildProfilePageUrl, buildProfileSeoDescription, fetchPublicProfile, type LinkedAccount } from "./profile-utils"
import { RoleBadge } from "@/components/role-badge"

type InteractionCounter = {
  "@type": "InteractionCounter"
  interactionType: string
  userInteractionCount: number
}

const providerMap: Record<
  string,
  {
    label: string
    icon: ComponentType<{ className?: string }>
    baseUrl?: (handle: string) => string
  }
> = {
  youtube: {
    label: "YouTube",
    icon: SiYoutube,
    baseUrl: (handle) => `https://youtube.com/${handle.replace(/^@/, "")}`,
  },
  instagram: {
    label: "Instagram",
    icon: SiInstagram,
    baseUrl: (handle) => `https://instagram.com/${handle.replace(/^@/, "")}`,
  },
  x: {
    label: "X",
    icon: SiX,
    baseUrl: (handle) => `https://x.com/${handle.replace(/^@/, "")}`,
  },
  tiktok: {
    label: "TikTok",
    icon: SiTiktok,
    baseUrl: (handle) => `https://www.tiktok.com/@${handle.replace(/^@/, "")}`,
  },
  twitch: {
    label: "Twitch",
    icon: SiTwitch,
    baseUrl: (handle) => `https://twitch.tv/${handle.replace(/^@/, "")}`,
  },
  faceit: {
    label: "FACEIT",
    icon: SiFaceit,
    baseUrl: (handle) => `https://www.faceit.com/en/players/${handle}`,
  },
  steam: {
    label: "Steam",
    icon: SiSteam,
    baseUrl: (handle) => `https://steamcommunity.com/id/${handle}`,
  },
  github: {
    label: "GitHub",
    icon: SiGithub,
    baseUrl: (handle) => `https://github.com/${handle}`,
  },
  gitlab: {
    label: "GitLab",
    icon: SiGitlab,
    baseUrl: (handle) => `https://gitlab.com/${handle}`,
  },
  slack: {
    label: "Slack",
    icon: SiSlack,
  },
  microsoft: {
    label: "Microsoft",
    icon: FaMicrosoft,
  },
  discord_alt: {
    label: "Discord",
    icon: SiDiscord,
  },
}

const resolveAccountUrl = (account: LinkedAccount) => {
  const handle = (account.handle || "").trim()
  if (!handle) return null
  if (/^https?:\/\//i.test(handle)) {
    return handle
  }
  const config = providerMap[account.provider]
  if (config?.baseUrl) {
    return config.baseUrl(handle)
  }
  return null
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const profile = await fetchPublicProfile(slug)
  if (!profile) {
    notFound()
  }
  if ("restricted" in profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="max-w-md space-y-6 text-center">
            <div className="rounded-2xl border border-border/50 bg-card/30 p-8 space-y-4">
              <p className="text-2xl font-semibold text-foreground">Private Profile</p>
              <p className="text-sm text-foreground/70">
                This creator keeps their profile hidden. Ask them to make it public if you&apos;d like to take a look.
              </p>
            </div>
            <div className="rounded-2xl border border-border/30 bg-card/20 p-6 text-sm text-foreground/70 space-y-3">
              <p>Meanwhile you can:</p>
              <ul className="list-disc list-inside text-foreground/60 text-left space-y-2">
                <li>Explore automation ideas in our success stories.</li>
                <li>Ping the creator via Discord to request access.</li>
                <li>Contact our support desk if something feels off.</li>
              </ul>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
            >
              Return home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const profileUrl = buildProfilePageUrl(profile.handle)

  const totalServers = profile.totalGuildCount ?? profile.membershipCount ?? 0
  const botInstallations = profile.botGuildCount ?? profile.activeGuildCount ?? 0
  const adminServers = profile.adminGuildCount ?? 0
  const activeGuilds: Array<{ id: string; name: string; hasBot?: boolean }> = Array.isArray(profile.activeGuilds)
    ? profile.activeGuilds
    : Array.isArray(profile.adminGuilds)
      ? profile.adminGuilds.filter((guild: { hasBot?: boolean }) => guild.hasBot)
      : []
  const totalGuildSamples: Array<{ id: string; name: string; hasBot?: boolean; isAdmin?: boolean }> = Array.isArray(
    profile.totalGuildSamples,
  )
    ? profile.totalGuildSamples
    : Array.isArray(profile.memberGuilds)
      ? profile.memberGuilds
      : []
  const stats = [
    { label: "Bot Installations", value: botInstallations },
    { label: "Total Servers", value: totalServers },
    { label: "Admin Servers", value: adminServers },
  ]
  const linkedAccounts: LinkedAccount[] = Array.isArray(profile.linkedAccounts) ? profile.linkedAccounts : []
  const linkedWithUrls = linkedAccounts
    .map((account) => ({ account, href: resolveAccountUrl(account) }))
    .filter((item) => Boolean(item.href)) as Array<{ account: LinkedAccount; href: string }>
  const seoDescription = buildProfileSeoDescription(profile)
  const interactionStatistic: InteractionCounter[] = [
    botInstallations
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/InstallAction",
          userInteractionCount: botInstallations,
        }
      : null,
    totalServers
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/JoinAction",
          userInteractionCount: totalServers,
        }
      : null,
  ].filter((stat): stat is InteractionCounter => Boolean(stat))
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.displayName,
    alternateName: `@${profile.handle}`,
    url: profileUrl,
    description: seoDescription,
    image: profile.avatarUrl || undefined,
    jobTitle: profile.headline || undefined,
    homeLocation: profile.location ? { "@type": "Place", name: profile.location } : undefined,
    sameAs: linkedWithUrls.map(({ href }) => href),
    interactionStatistic,
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        className="sr-only"
      />
      <main className="flex-1 w-full px-4 py-24">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-24 h-24 rounded-full border border-border/40 bg-primary/10 overflow-hidden flex items-center justify-center text-3xl font-semibold text-primary">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  (profile.displayName || "VB").slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-foreground/50">@{profile.handle}</p>
                <h1 className="text-4xl font-semibold text-foreground mt-2">{profile.displayName}</h1>
                {profile.headline ? <p className="text-foreground/70 mt-3">{profile.headline}</p> : null}
                {profile.role && (
                  <div className="mt-3">
                    <RoleBadge role={profile.role} />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs text-foreground/60">
                  {profile.location ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/40 px-3 py-1">
                      <span>📍</span>
                      {profile.location}
                    </span>
                  ) : null}
                  {profile.website ? (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border/40 px-3 py-1 hover:text-primary transition-colors"
                    >
                      <span>↗</span>
                      {new URL(profile.website).hostname}
                    </a>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/40 px-3 py-1">
                    <span>🛰️</span>
                    {profile.membershipCount ?? 0} active guild
                    {profile.membershipCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3 text-xs text-foreground/60">
                <div className="w-full max-w-lg rounded-lg border border-border/50 bg-background/40 px-4 py-2 text-sm font-mono text-foreground/80 text-center select-all">
                  {profileUrl}
                </div>
                <Link
                  href="/support-desk"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Contact Support
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border/50 bg-card/20 backdrop-blur-xl p-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">About</h2>
            {profile.bio ? (
              <div className="prose prose-invert prose-sm max-w-none text-foreground/80">
                <ReactMarkdown>{profile.bio}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-foreground/60">This profile has not shared any details yet.</p>
            )}
          </div>

          {linkedWithUrls.length ? (
            <div className="rounded-3xl border border-border/50 bg-card/20 backdrop-blur-xl p-8 space-y-6">
              <div className="border-border/40 space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Linked Profiles</h3>
                <div className="flex flex-wrap gap-3">
                  {linkedWithUrls.map(({ account, href }) => {
                    const providerMeta = providerMap[account.provider]
                    const Icon = providerMeta?.icon ?? LinkIcon
                    const label = providerMeta?.label ?? account.provider
                    return (
                      <a
                        key={account.id}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-border/40 text-foreground/80 hover:border-primary/60 hover:text-primary transition-colors"
                        aria-label={label}
                        title={label}
                      >
                        <Icon className="w-5 h-5" />
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-border/50 bg-card/20 backdrop-blur-xl p-8 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Server Footprint</h2>
              <p className="text-sm text-foreground/60">
                Live deployment metrics pulled from Discord. Individual server names remain private unless the owner chooses to
                disclose them.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/40 bg-background/30 p-4 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Active Guilds (VectoBeat Installed)</h3>
                {activeGuilds.length ? (
                  <ul className="space-y-2 text-sm text-foreground/80">
                    {activeGuilds.map((guild) => (
                      <li
                        key={guild.id}
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2"
                      >
                        <span>{guild.name}</span>
                        <span className="text-xs font-semibold text-primary">Bot Active</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-foreground/60">No public servers currently running VectoBeat.</p>
                )}
              </div>
            </div>
            <p className="text-xs text-foreground/60">
              These numbers refresh whenever the creator signs in or syncs their Discord account with VectoBeat.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
