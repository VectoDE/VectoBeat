import { NextResponse, type NextRequest } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getForumStats,
  listForumCategories,
  listForumEvents,
  listForumPosts,
  listForumThreads,
  getUserRole,
} from "@/lib/db"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  const categorySlug = request.nextUrl.searchParams.get("category") ?? undefined
  const threadId = request.nextUrl.searchParams.get("threadId") ?? undefined

  if (!discordId) {
    return NextResponse.json({ error: "discordId_required" }, { status: 400 })
  }

  const verification = await verifyRequestForUser(request, discordId)
  if (!verification.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = await getUserRole(discordId)
  if (role !== "admin" && role !== "operator") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  try {
    const [stats, categories, threads, events, posts] = await Promise.all([
      getForumStats(),
      listForumCategories(),
      listForumThreads(categorySlug || undefined),
      listForumEvents(50, categorySlug ? { categorySlug } : undefined),
      threadId ? listForumPosts(threadId) : Promise.resolve([]),
    ])

    return NextResponse.json({
      stats,
      categories,
      threads,
      events,
      posts,
    })
  } catch (error) {
    console.error("[VectoBeat] Failed to load admin forum data:", error)
    return NextResponse.json({ error: "unavailable" }, { status: 500 })
  }
}
