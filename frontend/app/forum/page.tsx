export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import { cookies } from "next/headers"
import {
  getUserSubscriptions,
  listSupportKnowledgeBase,
  listForumCategories,
  listForumThreads,
  listForumPosts,
  getUserRole,
} from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"
import { ForumReplyBox } from "@/components/forum-actions"
import { ForumThreadBrowser } from "@/components/forum-thread-browser"

const SUPPORT_DESK_LINK = "/support-desk"
const ROADMAP_LINK = "/roadmap"

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))

export default async function ForumPage() {
  const cookieStore = await cookies()
  const discordId = cookieStore.get("discord_id")?.value || cookieStore.get("discordId")?.value || null
  let proAccess = false
  let isTeam = false
  let kbArticles: Awaited<ReturnType<typeof listSupportKnowledgeBase>> = []
  let categories: Awaited<ReturnType<typeof listForumCategories>> = []
  let threads: Awaited<ReturnType<typeof listForumThreads>> = []
  let posts: Awaited<ReturnType<typeof listForumPosts>> = []
  try {
    if (discordId) {
      const subs = await getUserSubscriptions(discordId)
      const tiers = subs.map((sub) => normalizeTierId(sub.tier))
      proAccess = hasProPlus(tiers)
      const role = await getUserRole(discordId)
      isTeam = ["admin", "operator"].includes(role)
    }
    categories = await listForumCategories()
    threads = await listForumThreads()
    if (threads[0]) {
      posts = await listForumPosts(threads[0].id)
    }
    if (isTeam) {
      kbArticles = await listSupportKnowledgeBase(proAccess ? 6 : 3)
    } else {
      kbArticles = []
    }
  } catch {
    proAccess = false
  }

  const canPost = Boolean(discordId && proAccess)
  const showForum = true
  const accentPalette = [
    "from-emerald-500 to-cyan-500",
    "from-sky-500 to-indigo-500",
    "from-amber-500 to-rose-500",
    "from-purple-500 to-pink-500",
    "from-blue-500 to-emerald-500",
    "from-slate-500 to-slate-700",
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {!showForum ? null : (
        <>
          <section className="relative w-full pt-28 pb-10 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-10 right-10 w-80 h-80 bg-primary/15 rounded-full blur-3xl opacity-40" />
          <div className="absolute -bottom-16 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl opacity-30" />
        </div>
        <div className="relative max-w-6xl mx-auto flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-primary/70">Forum · Pro+</p>
            <h1 className="text-4xl md:text-5xl font-bold">Forum access is live</h1>
            <p className="text-foreground/70 text-lg">
              Public read access is open for everyone to browse best practices. Pro and higher communities can post and reply in
              topic spaces, playbooks, and role-gated threads. Starter sees read-only previews and can upgrade instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href={SUPPORT_DESK_LINK}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Request Pro+ Access
              </Link>
              <Link
                href={ROADMAP_LINK}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors"
              >
                View Forum Roadmap
              </Link>
            </div>
          </div>
          <div className="w-full lg:w-1/3">
            <div className="rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Access Control</span>
                <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-200 px-3 py-1 font-semibold">
                  Pro+ Posting
                </span>
              </div>
              <ul className="space-y-2 text-sm text-foreground/70">
                <li className="flex items-center gap-2">• Read-only browsing for everyone</li>
                <li className="flex items-center gap-2">• Owners & Moderators auto-invited for Pro+ guilds</li>
                <li className="flex items-center gap-2">• Role-gated threads for safety, automation, and releases</li>
                <li className="flex items-center gap-2">• Starter plans stay read-only; upgrade for posting</li>
              </ul>
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                Current state: Public read access + Private Alpha posting (Pro+).
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          {categories.map((cat, idx) => {
            const accent = accentPalette[idx % accentPalette.length]
            return (
            <div
              key={cat.title}
              className="rounded-2xl border border-border/50 bg-card/40 p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/50">Topic</p>
                  <h2 className="text-xl font-semibold text-foreground">{cat.title}</h2>
                </div>
                <div
                  className={`h-10 w-10 rounded-full bg-linear-to-br ${accent} opacity-80 shadow-lg shadow-black/20`}
                />
              </div>
              <p className="mt-2 text-sm text-foreground/70">{cat.threadCount} threads</p>
              {cat.slug.includes("moderator") ? (
                <span className="mt-3 inline-flex items-center rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200 border border-slate-700/80">
                  Role-gated
                </span>
              ) : (
                <span className="mt-3 inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 border border-emerald-500/30">
                  Open to Pro+
                </span>
              )}
            </div>
          )})}
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary/60">Browse Threads</p>
                <h3 className="text-2xl font-semibold text-foreground">Kategorisierte Diskussionen</h3>
                <p className="text-sm text-foreground/60">
                  Threads kommen direkt aus dem Forum. Team-Mitglieder eröffnen Haupt-Threads; Pro+ können darin Themen starten,
                  alle angemeldeten Nutzer dürfen kommentieren.
                </p>
              </div>
              <Link
                href={SUPPORT_DESK_LINK}
                className="text-sm font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-2"
              >
                Support kontaktieren →
              </Link>
            </div>

            <div className="mt-4">
              <ForumThreadBrowser
                discordId={discordId}
                canPost={canPost}
                canComment={Boolean(discordId)}
                categories={categories.map((cat) => ({ slug: cat.slug, title: cat.title }))}
                initialThreads={threads}
                initialPosts={posts}
                defaultCategory={categories[0]?.slug}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 pb-16">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
            <h3 className="text-xl font-semibold text-foreground mb-3">Role-Gated Access</h3>
            <ul className="space-y-2 text-sm text-foreground/70">
              <li>• Team (Admin/Operator) — creates top-level threads</li>
              <li>• Pro+ members — start topics within threads</li>
              <li>• Signed-in users — comment & react</li>
              <li>• Starter/Free — read-only</li>
            </ul>
            <p className="mt-3 text-sm text-foreground/60">
              Role tags sync nightly with your guild’s settings. Upgrade to Pro to unlock posting immediately.
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
            <h3 className="text-xl font-semibold text-foreground mb-3">What to expect</h3>
            <ul className="space-y-2 text-sm text-foreground/70">
              <li>• Topic spaces for automation, sound design, status/reliability, and compliance</li>
              <li>• Playbooks and checklists from the success team</li>
              <li>• Release previews with feedback threads before GA</li>
              <li>• Moderation lounge with incident retros (role-gated)</li>
            </ul>
          </div>
        </div>
      </section>

          <Footer />
        </>
      )}
    </div>
  )
}
