import { buildPageMetadata } from "@/lib/seo"
import { listForumCategories, listForumThreads } from "@/lib/db"
import { resolveForumParams } from "../../utils"

type Params = { thema: string; thread: string }

const FALLBACK = buildPageMetadata({
  title: "Forum Thread | VectoBeat",
  description: "Read and contribute to VectoBeat forum threads covering automations, sound design, and reliability.",
  path: "/forum",
})

export async function generateMetadata({ params }: { params: Promise<Params> | Params }) {
  try {
    const { thema, thread } = await resolveForumParams(params)
    const categorySlug = decodeURIComponent(thema)
    const threadId = decodeURIComponent(thread)

    const [categories, threads] = await Promise.all([listForumCategories(), listForumThreads(categorySlug)])
    const category = categories.find((entry) => entry.slug === categorySlug)
    const currentThread = threads.find((entry) => entry.id === threadId)

    if (!category || !currentThread) {
      return FALLBACK
    }

    const description =
      currentThread.summary ||
      `Join the discussion on ${currentThread.title} in the ${category.title} space. Share VectoBeat setups, macros, and fixes.`

    return buildPageMetadata({
      title: `${currentThread.title} | ${category.title} | VectoBeat Forum`,
      description,
      path: `/forum/${categorySlug}/${threadId}`,
      keywords: ["vectobeat forum", category.title, currentThread.title, "discord music bot community", "vectobeat tips"],
    })
  } catch {
    return FALLBACK
  }
}
