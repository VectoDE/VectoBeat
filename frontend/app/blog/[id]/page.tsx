import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { User, ArrowLeft, Clock, Eye } from "lucide-react"
import Link from "next/link"
import { cookies, headers } from "next/headers"
import { BlogShareButton } from "@/components/blog-share-button"
import { MarkdownContent } from "@/components/markdown-content"
import { BlogReactions } from "@/components/blog-reactions"
import { BlogComments } from "@/components/blog-comments"
import { BlogSessionBootstrap } from "@/components/blog-session-bootstrap"
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
  const { id } = await params
  const post = await getBlogPostByIdentifier(id)

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

  const postIdentifier = post.slug ?? post.id

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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <BlogSessionBootstrap initialToken={bootstrapToken} initialDiscordId={bootstrapDiscordId} />

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
            <MarkdownContent content={hydratedPost.content} />
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

      <Footer />
    </div>
  )
}
