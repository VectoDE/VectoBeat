import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/seo"

const STATIC_ROUTES = [
  "/",
  "/about",
  "/pricing",
  "/features",
  "/roadmap",
  "/blog",
  "/changelog",
  "/contact",
  "/support-desk",
  "/developer",
  "/stats",
  "/success",
  "/success-stories",
  "/forum",
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return STATIC_ROUTES.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.8,
  }))
}
