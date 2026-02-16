import { buildPageMetadata } from "@/lib/seo"

export function buildBlogOverviewMetadata() {
  return buildPageMetadata({
    title: "Blog | VectoBeat",
    description: "Latest news, guides, and updates from VectoBeat. Explore our collection of articles on Discord music automation, release updates, and community insights.",
    path: "/blog",
  })
}

export const defaultBlogOverviewMetadata = buildBlogOverviewMetadata()