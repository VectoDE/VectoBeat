export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Calendar, Clock, Eye } from "lucide-react"
import Link from "next/link"
import { headers } from "next/headers"
import { getBlogPosts } from "@/lib/db"
import { NewsletterSignup } from "@/components/newsletter-signup"

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

  return "https://vectobeat.com"
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Blog</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            Latest news, guides, and insights about VectoBeat and the world of Discord music automation.
          </p>
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
                    key={post.id}
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
                We’re preparing fresh content. Check back soon for new guides and updates.
              </p>
            </div>
          )}
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
