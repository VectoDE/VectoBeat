import type { MetadataRoute } from "next"
import { getBlogPosts, listPublicProfileSlugs } from "@/lib/db"
import { siteUrl } from "@/lib/seo"

const STATIC_ROUTES = [
  "/",
  "/pricing",
  "/features",
  "/blog",
  "/forum",
  "/about",
  "/roadmap",
  "/changelog",
  "/contact",
  "/support-desk",
  "/developer",
  "/stats",
  "/success-stories",
  "/account",
  "/eula",
  "/sla",
  "/favicon.ico",
]

const DISALLOWED = new Set([
  "/api",
  "/control-panel",
  "/control-panel/admin",
  "/invoice-sample",
  "/two-factor",
  "/error",
  "/not-found",
  "/global-error",
  "/privacy",
  "/terms",
  "/imprint",
])

const toEntry = (path: string, lastModified: Date, priority: number): MetadataRoute.Sitemap[number] => ({
  url: new URL(path, siteUrl).toString(),
  lastModified,
  changeFrequency: "weekly",
  priority,
})

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.filter((path) => !DISALLOWED.has(path)).map((path) =>
    toEntry(path, now, path === "/" ? 1 : 0.8),
  )

  const blogPosts = await getBlogPosts().catch((error) => {
    console.error("[VectoBeat] Failed to build blog sitemap:", error)
    return []
  })

  const blogEntries: MetadataRoute.Sitemap = blogPosts.flatMap((post) => {
    const slug = post.slug || post.id
    if (!slug) return []

    const lastModified = post.publishedAt ? new Date(post.publishedAt) : now
    return [
      {
        url: new URL(`/blog/${slug}`, siteUrl).toString(),
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
      } satisfies MetadataRoute.Sitemap[number],
    ]
  })

  const publicProfiles = await listPublicProfileSlugs().catch((error) => {
    console.error("[VectoBeat] Failed to build profile sitemap:", error)
    return []
  })

  const profileEntries: MetadataRoute.Sitemap = publicProfiles.map(({ slug, updatedAt }) =>
    toEntry(`/profile/${slug}`, updatedAt ?? now, 0.6),
  )

  return [...staticEntries, ...blogEntries, ...profileEntries]
}
