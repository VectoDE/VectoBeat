import type { MetadataRoute } from "next"

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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOW,
    },
    sitemap: "https://vectobeat.uplytech.de/sitemap.xml",
    host: "https://vectobeat.uplytech.de",
  }
}
