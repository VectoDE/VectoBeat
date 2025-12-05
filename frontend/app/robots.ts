import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/seo"

const DISALLOW = [
  "/api",
  "/control-panel",
  "/control-panel/admin",
  "/error",
  "/not-found",
  "/global-error",
  "/privacy",
  "/terms",
  "/sla",
  "/imprint",
]

const ALLOW = ["/", "/favicon.ico"]

export default function robots(): MetadataRoute.Robots {
  const baseRules = {
    allow: ALLOW,
    disallow: DISALLOW,
  }

  return {
    rules: [
      { ...baseRules, userAgent: "*" },
      { ...baseRules, userAgent: "Googlebot" },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
