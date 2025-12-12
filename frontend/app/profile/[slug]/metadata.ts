import { buildPageMetadata } from "@/lib/seo"
import { buildProfileKeywords, buildProfileSeoDescription, fetchPublicProfile } from "./profile-utils"

const FALLBACK = buildPageMetadata({
  title: "Profiles | VectoBeat Community",
  description: "Discover verified VectoBeat creator profiles, Discord music bot installs, and automation wins.",
  path: "/profile",
  keywords: ["vectobeat profile", "discord community", "vectobeat members", "discord music bot creators"],
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const awaited = await params
  const slug = decodeURIComponent(awaited.slug || "")
  if (!slug) {
    return FALLBACK
  }

  const profile = await fetchPublicProfile(slug)

  if (!profile || "restricted" in profile) {
    return buildPageMetadata({
      title: "Private or missing profile | VectoBeat",
      description: "This VectoBeat profile is private or no longer exists. Explore public creators and Discord automations instead.",
      path: `/profile/${slug}`,
      noindex: true,
      keywords: ["vectobeat profile", "private profile", "discord music bot", "discord community"],
    })
  }

  const handle = profile.handle || slug
  const name = profile.displayName || profile.username || handle
  const description = buildProfileSeoDescription(profile)
  const keywords = buildProfileKeywords(profile)

  return buildPageMetadata({
    title: `${name} (@${handle}) | VectoBeat Profile`,
    description,
    path: `/profile/${handle}`,
    image: profile.avatarUrl
      ? {
          url: profile.avatarUrl,
          alt: `${name} on VectoBeat`,
          width: 1200,
          height: 630,
        }
      : undefined,
    keywords,
  })
}
