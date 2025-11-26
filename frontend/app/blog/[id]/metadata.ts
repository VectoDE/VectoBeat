import { buildPageMetadata } from "@/lib/seo"

export const defaultBlogPostMetadata = (slug: string) =>
  buildPageMetadata({
    title: "Blog | VectoBeat",
    description: "VectoBeat news, releases, and Discord bot guides.",
    path: `/blog/${slug}`,
    keywords: ["vectobeat blog", "discord bot guides", "lavalink tutorials", "vectobeat releases"],
  })

export const buildBlogPostMetadata = ({
  title,
  excerpt,
  slug,
  image,
}: {
  title: string
  excerpt?: string | null
  slug: string
  image?: string | null
}) =>
  buildPageMetadata({
    title: `${title} | VectoBeat Blog`,
    description: excerpt || "VectoBeat news, releases, and Discord bot guides.",
    path: `/blog/${slug}`,
    image: image
      ? {
          url: image,
          alt: title,
          width: 1200,
          height: 630,
        }
      : undefined,
    keywords: ["vectobeat blog", "discord bot updates", "discord music guides", "lavalink tutorials", title],
  })
