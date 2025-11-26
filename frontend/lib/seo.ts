import type { Metadata } from "next"

export const siteUrl = "https://vectobeat.uplytech.de"

type SeoOptions = {
  title: string
  description: string
  path?: string
  image?: {
    url: string
    alt?: string
    width?: number
    height?: number
  }
  noindex?: boolean
  keywords?: string[]
}

export const buildPageMetadata = ({
  title,
  description,
  path = "/",
  image,
  noindex = false,
  keywords = [],
}: SeoOptions): Metadata => {
  const canonical = new URL(path, siteUrl).toString()
  const ogImage = image || {
    url: "/logo.png",
    width: 1200,
    height: 630,
    alt: title,
  }

  return {
    title,
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: false } : undefined,
    keywords: keywords.length ? keywords : undefined,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "VectoBeat",
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
      creator: "@vectobeat",
    },
  }
}
