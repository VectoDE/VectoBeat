import { buildPageMetadata } from "@/lib/seo"
import { listForumCategories, listForumThreads } from "@/lib/db"
import { resolveForumParams } from "../utils"

type Params = { thema: string }

const FALLBACK = buildPageMetadata({
  title: "Forum Topic | VectoBeat",
  description: "Explore VectoBeat forum topics for automation playbooks, sound design, and reliability tips.",
  path: "/forum",
})

export async function generateMetadata({ params }: { params: Promise<Params> | Params }) {
  try {
    const { thema } = await resolveForumParams(params)
    const slug = decodeURIComponent(thema)
    const [categories, threads] = await Promise.all([listForumCategories(), listForumThreads(slug)])
    const category = categories.find((entry) => entry.slug === slug)

    if (!category) {
      return FALLBACK
    }

    const threadCount = threads.length || category.threadCount
    const description =
      category.description ||
      `Discuss VectoBeat setups, automation playbooks, and reliability fixes for ${category.title}. ${threadCount} threads live.`

    return buildPageMetadata({
      title: `${category.title} | VectoBeat Forum`,
      description,
      path: `/forum/${slug}`,
      keywords: [
        "vectobeat forum",
        `${category.title} discussion`,
        "discord music bot community",
        "vectobeat automation playbooks",
        "vectobeat reliability threads",
      ],
    })
  } catch {
    return FALLBACK
  }
}
