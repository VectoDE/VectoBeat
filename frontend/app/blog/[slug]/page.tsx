import { getBlogPostByIdentifier, getBlogPosts } from "@/lib/db"
import { notFound } from "next/navigation"
import Image from "next/image"
import { Calendar, Clock, Eye } from "lucide-react"
import Link from "next/link"
import { buildBlogPostMetadata, defaultBlogPostMetadata } from "./metadata"
import { sanitizeSlug, resolveParams } from "@/lib/utils"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import DOMPurify from "isomorphic-dompurify"

type BlogPageParams = { params: Promise<{ slug: string }> | { slug: string } }

export async function generateMetadata({ params }: BlogPageParams) {
  const { slug } = await resolveParams(params)
  const sanitizedSlug = sanitizeSlug(slug)

  try {
    const post = await getBlogPostByIdentifier(sanitizedSlug)

    if (!post) {
      return defaultBlogPostMetadata(sanitizedSlug)
    }

    return buildBlogPostMetadata({
      title: post.title,
      excerpt: post.excerpt,
      slug: post.slug ?? post.id,
      image: post.image ?? null,
    })
  } catch {
    return defaultBlogPostMetadata(sanitizedSlug)
  }
}

export default async function BlogPostPage({ params }: BlogPageParams) {
  const { slug } = await resolveParams(params)
  const sanitizedSlug = sanitizeSlug(slug)
  const post = await getBlogPostByIdentifier(sanitizedSlug)

  if (!post) {
    notFound()
  }

  const allPosts = await getBlogPosts()
  const otherPosts = allPosts.filter((p) => p.id !== post.id).slice(0, 3)
  const latestPosts = allPosts.slice(0, 3)

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="py-20 px-4">
        <article className="max-w-4xl mx-auto">
          <header className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{post.title}</h1>
            <div className="flex items-center justify-center gap-4 text-sm text-foreground/60">
              <span className="inline-flex items-center gap-2">
                <Calendar size={14} />
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              {post.readTime && (
                <span className="inline-flex items-center gap-2">
                  <Clock size={14} />
                  {post.readTime}
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <Eye size={14} />
                {post.views?.toLocaleString() ?? 0} views
              </span>
            </div>
          </header>

          {post.image && (
            <div className="mb-12">
              <Image 
                src={post.image} 
                alt={post.title} 
                className="w-full h-auto rounded-lg" 
                width={800}
                height={450}
                priority
              />
            </div>
          )}

          <div
            className="prose prose-lg dark:prose-invert mx-auto"
            dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(post.content, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel']
              })
            }}
          />
        </article>

        {/* Related Posts Section */}
        <aside className="max-w-4xl mx-auto mt-20">
          <h2 className="text-2xl font-bold mb-8 text-center">Related Posts</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {otherPosts.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="group rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-all overflow-hidden cursor-pointer"
              >
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{p.title}</h3>
                  <p className="text-sm text-foreground/70 line-clamp-3">{p.excerpt}</p>
                  <div className="flex items-center gap-2 mt-4 text-xs text-foreground/60">
                    <Calendar size={12} />
                    {new Date(p.publishedAt).toLocaleDateString("en-US")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </aside>

        {/* Latest Posts Section */}
        <aside className="max-w-4xl mx-auto mt-20">
          <h2 className="text-2xl font-bold mb-8 text-center">Latest Posts</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {latestPosts.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="group rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-all overflow-hidden cursor-pointer"
              >
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{p.title}</h3>
                  <p className="text-sm text-foreground/70 line-clamp-3">{p.excerpt}</p>
                  <div className="flex items-center gap-2 mt-4 text-xs text-foreground/60">
                    <Calendar size={12} />
                    {new Date(p.publishedAt).toLocaleDateString("en-US")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </main>
      <Footer />
    </div>
  )
}