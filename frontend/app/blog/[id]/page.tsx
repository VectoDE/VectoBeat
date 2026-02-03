import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { User, ArrowLeft, Clock, Eye, Link2, BarChart3 } from "lucide-react"
import Link from "next/link"
import { cookies, headers } from "next/headers"
import { BlogShareButton } from "@/components/blog-share-button"
import { MarkdownContent } from "@/components/markdown-content"
import { BlogReactions } from "@/components/blog-reactions"
import { BlogComments } from "@/components/blog-comments"
import { BlogSessionBootstrap } from "@/components/blog-session-bootstrap"
import { buildBlogPostMetadata, defaultBlogPostMetadata } from "./metadata"
import {
  getBlogPostByIdentifier,
  getBlogPosts,
  incrementBlogViews,
  getBlogReactions,
  getBlogComments,
  type BlogPost,
  type BlogReactionSummary,
  type BlogComment,
} from "@/lib/db"
import Script from "next/script"
import { siteUrl } from "@/lib/seo"

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

const sanitizeSlug = (value: string | number | null | undefined) => {
  const raw =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : value != null
        ? String(value)
        : ""
  return /^[A-Za-z0-9-_]+$/.test(raw) ? raw : encodeURIComponent(raw)
}

type BlogPageParams = { params: Promise<{ id: string }> | { id: string } }

const resolveParams = async (params: BlogPageParams["params"]) => {
  return "then" in params ? params : Promise.resolve(params)
}

const formatContentForRender = (value: string) => {
  if (!value) return ""
  const normalized = value.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "  ")
  const lines = normalized.split("\n")
  const indentLengths = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.match(/^[ \t]*/)?.[0].length ?? 0))
  const minIndent = indentLengths.length ? Math.min(...indentLengths) : 0
  const stripped =
    minIndent > 0
      ? lines
          .map((line) => (line.length >= minIndent ? line.slice(minIndent) : line.trimStart()))
          .join("\n")
      : normalized
  const trimmed = stripped.trim()

  // Ensure heading markers without a space still render as headings (e.g., "#Title" -> "# Title").
  const normalizedHeadings = trimmed.replace(/^(#{1,6})([^\s#])/gm, (_match, hashes: string, title: string) => {
    return `${hashes} ${title}`
  })

  return normalizedHeadings
}

export async function generateMetadata({ params }: BlogPageParams) {
  const { id } = await resolveParams(params)
  const slug = sanitizeSlug(id)
  try {
    const post = await getBlogPostByIdentifier(slug)
    if (!post) {
      return defaultBlogPostMetadata(slug)
    }
    return buildBlogPostMetadata({
      title: post.title,
      excerpt: post.excerpt,
      slug,
      image: post.image,
    })
  } catch {
    return defaultBlogPostMetadata(slug)
  }
}

type BlogApiPayload = {
  post: BlogPost
  relatedPosts: BlogPost[]
  reactions: BlogReactionSummary
  comments: BlogComment[]
}

const fetchBlogPayload = async (identifier: string, runtimeOrigin?: string | null): Promise<BlogApiPayload | null> => {
  const baseUrl = getBaseUrl(runtimeOrigin)
  try {
    const response = await fetch(`${baseUrl}/api/blog/${encodeURIComponent(identifier)}`, {
      cache: "no-store",
    })
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as BlogApiPayload
    if (payload?.post) {
      return payload
    }
    return null
  } catch (error) {
    console.error("[VectoBeat] Failed to fetch blog post via API:", error)
    return null
  }
}

export default async function BlogPostPage({ params }: BlogPageParams) {
  const { id } = await resolveParams(params)
  const safeId = sanitizeSlug(id)
  const post = await getBlogPostByIdentifier(safeId)

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Post Not Found</h1>
            <p className="text-foreground/70 mb-6">The blog post you&rsquo;re looking for doesn&rsquo;t exist.</p>
            <Link href="/blog" className="text-primary hover:text-primary/80">
              Back to Blog
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  const postIdentifier = sanitizeSlug(post.slug ?? post.id)

  await incrementBlogViews(postIdentifier)

  const runtimeOrigin = await getRuntimeOrigin()
  const apiPayload = await fetchBlogPayload(postIdentifier, runtimeOrigin)

  let hydratedPost: BlogPost = post
  let relatedPosts: BlogPost[] = []
  let reactions: BlogReactionSummary = { up: 0, down: 0 }
  let comments: BlogComment[] = []

  if (apiPayload) {
    hydratedPost = apiPayload.post
    relatedPosts = apiPayload.relatedPosts ?? []
    reactions = apiPayload.reactions
    comments = apiPayload.comments
  } else {
    const [refreshedPost, allPosts, fallbackReactions, fallbackComments] = await Promise.all([
      getBlogPostByIdentifier(postIdentifier),
      getBlogPosts(),
      getBlogReactions(postIdentifier),
      getBlogComments(postIdentifier),
    ])
    hydratedPost = refreshedPost ?? post
    relatedPosts = allPosts.filter((item) => item.id !== hydratedPost.id && item.category === hydratedPost.category).slice(0, 3)
    reactions = fallbackReactions
    comments = fallbackComments
  }

  const shareUrl = `${getBaseUrl(runtimeOrigin)}/blog/${sanitizeSlug(hydratedPost.slug ?? hydratedPost.id)}`
  const cookieStore = await cookies()
  const bootstrapToken = cookieStore.get("discord_token")?.value ?? null
  const bootstrapDiscordId = cookieStore.get("discord_user_id")?.value ?? null
  const markdownContent =
    typeof hydratedPost.content === "string" ? formatContentForRender(hydratedPost.content) : ""
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: hydratedPost.title,
    description: hydratedPost.excerpt || hydratedPost.content?.slice(0, 160),
    datePublished: new Date(hydratedPost.publishedAt).toISOString(),
    dateModified: new Date(hydratedPost.updatedAt || hydratedPost.publishedAt).toISOString(),
    author: {
      "@type": "Person",
      name: hydratedPost.author || "VectoBeat Team",
    },
    image: hydratedPost.image || `${siteUrl}/og-image.jpg`,
    mainEntityOfPage: `${siteUrl}/blog/${postIdentifier}`,
    publisher: {
      "@type": "Organization",
      name: "VectoBeat",
      url: siteUrl,
    },
  }
  const insightsSummary = [
    { label: "Category", value: hydratedPost.category || "Updates" },
    {
      label: "Read time",
      value: hydratedPost.readTime || "5 min",
    },
    { label: "Published", value: new Date(hydratedPost.publishedAt).toLocaleDateString() },
    { label: "Views", value: (hydratedPost.views ?? 0).toLocaleString() },
  ]
  const vectobeatCtas = [
    { href: "/features", title: "Explore features", body: "See which VectoBeat capabilities the article references." },
    { href: "/pricing", title: "Compare plans", body: "Check how telemetry and automation scale across VectoBeat plans." },
    { href: "/support-desk", title: "Contact support", body: "Reach the team if you want deeper VectoBeat guidance." },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <BlogSessionBootstrap initialToken={bootstrapToken} initialDiscordId={bootstrapDiscordId} />
      <Script id="vectobeat-blog-article-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(articleJsonLd)}
      </Script>

      <article className="w-full py-20 px-4 pt-28 md:pt-40">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-12 md:mb-16 transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Blog
          </Link>

          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6 flex-wrap text-xs text-foreground/60">
              <span className="inline-flex px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold tracking-wide uppercase">
                {hydratedPost.category}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {new Date(hydratedPost.publishedAt).toLocaleDateString()}
              </span>
              {hydratedPost.readTime && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {hydratedPost.readTime}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Eye size={14} />
                {hydratedPost.views?.toLocaleString() ?? 0} views
              </span>
            </div>

            <h1 className="text-5xl font-bold mb-6 leading-tight">{hydratedPost.title}</h1>
            {hydratedPost.excerpt ? (
              <p className="text-lg text-foreground/70 mb-6">{hydratedPost.excerpt}</p>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {insightsSummary.map((item) => (
                <div key={item.label} className="rounded-xl border border-border/40 bg-card/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.4em] text-foreground/50">{item.label}</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-4 py-6 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User size={24} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{hydratedPost.author}</p>
                  <p className="text-sm text-foreground/60">
                    Published {new Date(hydratedPost.publishedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <BlogShareButton url={shareUrl} />
            </div>
          </div>

          <div className="space-y-8">
            <MarkdownContent content={markdownContent} />
            <BlogReactions postIdentifier={postIdentifier} initialReactions={reactions} />
            <BlogComments postIdentifier={postIdentifier} initialComments={comments} />
          </div>

          {relatedPosts.length > 0 && (
            <div className="mt-16 pt-10 border-t border-border">
              <p className="text-sm uppercase tracking-[0.4em] text-foreground/60 mb-4">Related Posts</p>
              <div className="grid gap-4">
                {relatedPosts.map((related) => {
                  const safeSlug = sanitizeSlug(related.slug ?? related.id)
                  const href = `/blog/${safeSlug}`
                  return (
                    <Link
                      key={related.id}
                      href={href}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between border border-border/40 rounded-lg p-4 hover:border-primary/40 transition-colors"
                    >
                      <div>
                      <p className="text-xs text-foreground/60 uppercase tracking-wide">{related.category}</p>
                      <p className="text-lg font-semibold">{related.title}</p>
                      <p className="text-xs text-foreground/60">
                        {new Date(related.publishedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-primary text-sm font-semibold mt-2 sm:mt-0">Read →</span>
                  </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </article>

      <section className="w-full py-12 px-4 border-t border-border bg-card/20">
        <div className="max-w-5xl mx-auto grid gap-4 md:grid-cols-3">
          {vectobeatCtas.map((cta) => (
            <Link
              key={cta.href}
              href={cta.href}
              className="rounded-2xl border border-border/50 bg-background/70 p-5 hover:border-primary/40 transition-colors flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">{cta.title}</h3>
                <ArrowLeft className="w-4 h-4 rotate-180 text-primary" />
              </div>
              <p className="text-sm text-foreground/70 flex-1">{cta.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  )
}
