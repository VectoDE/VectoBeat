import { buildBlogOverviewMetadata } from "./metadata"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Calendar, Clock, Eye, BarChart3, Link2 } from "lucide-react"
import Link from "next/link"
import { headers } from "next/headers"
import { getBlogPosts } from "@/lib/db"
import { NewsletterSignup } from "@/components/newsletter-signup"
import Script from "next/script"

export const dynamic = "force-dynamic"
export const metadata = buildBlogOverviewMetadata()

const BLOG_FAQ = [
  {
    question: "Which topics does the VectoBeat blog cover?",
    answer:
      "Guides about Discord music automation, release updates, telemetry best practices, and moderation playbooks—each post links back to live product context.",
  },
  {
    question: "How often do you publish new articles?",
    answer:
      "After every major release we post a changelog plus a tactical article. Smaller fixes get quick updates, and once a quarter we package deeper lessons.",
  },
  {
    question: "Can readers reuse the tutorials?",
    answer:
      "Absolutely. Please credit the source; most posts include automation and moderation templates you can adapt for your own servers.",
  },
  {
    question: "How do I stay informed?",
    answer:
      "Subscribe to the newsletter at the bottom of this page or join the community forum. Every article links to the relevant feature, pricing, and support resources.",
  },
]

const getBaseUrl = (runtimeOrigin?: string | null) => {
  const candidates = [
    process.env.NEXT_PUBLIC_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    runtimeOrigin,
    "http://localhost:3000",
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate)
      if (!parsed.protocol.startsWith("http")) continue
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      continue
    }
  }

  return "https://vectobeat.uplytech.de"
}

const getRuntimeOrigin = async () => {
  const headersList = await headers()
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host")
  if (!host) return null
  const isLocal = host.includes("localhost") || host.startsWith("127.") || host.startsWith("0.0.0.0")
  const protocol = headersList.get("x-forwarded-proto") ?? (isLocal ? "http" : "https")
  return `${protocol}://${host}`
}

export default async function BlogPage() {
  const runtimeOrigin = await getRuntimeOrigin()
  const baseUrl = getBaseUrl(runtimeOrigin)
  let posts = await getBlogPosts()

  try {
    const response = await fetch(`${baseUrl}/api/blog`, {
      next: { revalidate: 60 },
    })
    if (response.ok) {
      const payload = await response.json()
      if (Array.isArray(payload?.posts)) {
        posts = payload.posts
      }
    }
  } catch (error) {
    console.error("[VectoBeat] Failed to load blog posts via API:", error)
  }

  const totalViews = posts.reduce((sum, post) => sum + (post.views ?? 0), 0)
  const categories = Array.from(new Set(posts.map((post) => post.category).filter((cat): cat is string => Boolean(cat))))
  const latestPost = posts[0]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">VectoBeat Blog & Release Notes</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            Fresh news, playbooks, and VectoBeat-backed Discord music automation guides. {posts.length} posts connect release updates,
            roadmap signals, and support insights.
          </p>
          {latestPost ? (
            <p className="text-sm text-foreground/60 mt-4">
              Latest post:{" "}
              <Link href={`/blog/${latestPost.slug}`} className="text-primary font-semibold hover:text-primary/80">
                {latestPost.title}
              </Link>{" "}
              by {latestPost.author}
            </p>
          ) : null}
        </div>
      </section>

      <section className="w-full py-12 px-4 border-b border-border bg-card/10">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          <div className="p-5 rounded-2xl border border-border/40 bg-background/80">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Posts</p>
            <h3 className="text-3xl font-bold text-foreground">{posts.length}</h3>
            <p className="text-sm text-foreground/60">Curated articles on observability, automation, and community insights.</p>
          </div>
          <div className="p-5 rounded-2xl border border-border/40 bg-background/80">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Views</p>
            <h3 className="text-3xl font-bold text-foreground">{totalViews.toLocaleString()}</h3>
            <p className="text-sm text-foreground/60">Total page views across release notes and deep dives.</p>
          </div>
          <div className="p-5 rounded-2xl border border-border/40 bg-background/80">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Categories</p>
            <h3 className="text-3xl font-bold text-foreground">{categories.length || 1}</h3>
            <p className="text-sm text-foreground/60">From changelog to community—every story links to features and support.</p>
          </div>
        </div>
      </section>

      <section className="sr-only" aria-labelledby="blog-intro-heading">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-primary/70 mb-3">Why read?</p>
            <h2 id="blog-intro-heading" className="text-3xl font-bold mb-4">VectoBeat stories anchored in telemetry</h2>
            <p className="text-foreground/70 mb-4">
              Each publication references real SLOs, automations, and forum threads so readers get product-proof insights—always linked
              to <Link href="/features" className="text-primary underline">Features</Link>,{" "}
              <Link href="/pricing" className="text-primary underline">Pricing</Link>,{" "}
              <Link href="/support-desk" className="text-primary underline">Support</Link>, and{" "}
              <Link href="/forum" className="text-primary underline">Forum</Link>.
            </p>
            <ul className="space-y-2 text-sm text-foreground/70">
              <li className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-primary" />
                Release breakdowns with live metrics for latency, streams, and shards.
              </li>
              <li className="flex items-center gap-3">
                <Link2 className="w-5 h-5 text-primary" />
                Crosslinks to docs, API reference, and community threads strengthen every topic cluster.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card/30 p-6 space-y-3">
            <p className="text-sm text-foreground/60">Popular categories</p>
            <div className="flex flex-wrap gap-2">
              {(categories.length ? categories : ["Changelog", "Automation"]).map((cat) => (
                <span key={cat} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {cat}
                </span>
              ))}
            </div>
            <p className="text-xs text-foreground/60">
              Want a topic covered? Open a thread in the{" "}
              <Link href="/forum" className="text-primary underline">
                forum
              </Link>{" "}
              or share feedback on the{" "}
              <Link href="/roadmap" className="text-primary underline">
                roadmap
              </Link>
              board.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          {posts.length ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => {
                const rawSlug = typeof post.slug === "string" && post.slug.trim().length ? post.slug.trim() : String(post.id ?? "")
                const safeSlug = /^[A-Za-z0-9-_]+$/.test(rawSlug) ? rawSlug : encodeURIComponent(rawSlug)
                const href = `/blog/${safeSlug}`
                return (
                  <Link
                    key={rawSlug}
                    href={href}
                    className="group rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-all overflow-hidden cursor-pointer"
                  >
                  <div className="p-6 h-full flex flex-col">
                    <div className="mb-4">
                      <span className="inline-flex px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                        {post.category}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>

                    <p className="text-foreground/70 text-sm mb-6 grow line-clamp-3">{post.excerpt}</p>

                    <div className="flex items-center justify-between text-xs text-foreground/60 border-t border-border/30 pt-4 gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(post.publishedAt).toLocaleDateString("en-US")}
                        </span>
                        {post.readTime && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={14} />
                            {post.readTime}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Eye size={14} />
                          {post.views?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <span className="font-semibold">{post.author}</span>
                    </div>
                  </div>
                </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/40 bg-card/30 p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">No posts available</h2>
              <p className="text-foreground/70">
                We&apos;re preparing fresh content. Check back soon for new guides and updates.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Blog FAQs</h2>
          <div className="space-y-4">
            {BLOG_FAQ.map((faq) => (
              <details
                key={faq.question}
                className="group border border-border/60 rounded-xl p-4 bg-background/80 transition-colors hover:border-primary/30"
              >
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-lg">
                  {faq.question}
                  <span className="text-primary group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-sm text-foreground/70 mt-3">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto">
          <NewsletterSignup />
        </div>
      </section>

      <Footer />
    </div>
  )
}