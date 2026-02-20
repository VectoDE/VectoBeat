import { buildPageMetadata } from "@/lib/seo"

export function defaultBlogPostMetadata(slug: string) {
  return buildPageMetadata({
    title: "Blog Post Not Found",
    description: "This blog post could not be found.",
    path: `/blog/${slug}`,
  })
}

export function buildBlogPostMetadata({
  title,
  excerpt,
  slug,
  image,
}: {
  title: string
  excerpt: string
  slug: string
  image: string | null
}) {
  const imageObj = image ? { url: image, alt: title } : undefined
  
  return buildPageMetadata({
    title: `${title} | VectoBeat Blog`,
    description: excerpt,
    path: `/blog/${slug}`,
    image: imageObj,
  })
}