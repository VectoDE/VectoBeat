import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getUserSubscriptions,
  listForumCategories,
  listForumThreads,
  listForumPosts,
  createForumThread,
} from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))

const parseBody = async (request: NextRequest) => {
  const json = await request.json().catch(() => null)
  if (json) return json
  const form = await request.formData().catch(() => null)
  if (!form) return null
  const entries: Record<string, unknown> = {}
  form.forEach((value, key) => {
    entries[key] = value
  })
  return entries
}

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  let isPro = false
  if (discordId) {
    const auth = await verifyRequestForUser(request, discordId)
    if (auth.valid) {
      const subs = await getUserSubscriptions(discordId)
      const tiers = subs.map((sub) => normalizeTierId(sub.tier))
      isPro = hasProPlus(tiers)
    }
  }

  const category = request.nextUrl.searchParams.get("category") || undefined
  const categories = await listForumCategories()
  const threads = await listForumThreads(category)
  let posts = []
  const threadId = request.nextUrl.searchParams.get("threadId")
  if (threadId) {
    posts = await listForumPosts(threadId)
  }

  return NextResponse.json({ categories, threads, posts, pro: isPro })
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null
  if (!discordId) {
    return NextResponse.json({ error: "discordId required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const subs = await getUserSubscriptions(discordId)
  const tiers = subs.map((sub) => normalizeTierId(sub.tier))
  if (!hasProPlus(tiers)) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 })
  }

  const categorySlug = typeof body?.category === "string" ? body.category : null
  const title = typeof body?.title === "string" ? body.title : null
  const summary = typeof body?.summary === "string" ? body.summary : null
  const tags =
    Array.isArray(body?.tags) && body.tags.every((entry) => typeof entry === "string")
      ? (body.tags as string[])
      : typeof body?.tags === "string"
        ? body.tags.split(",").map((tag) => tag.trim())
        : []
  const content = typeof body?.body === "string" ? body.body : null

  if (!categorySlug || !title || !content) {
    return NextResponse.json({ error: "category, title, and body required" }, { status: 400 })
  }

  const authorName = auth.user?.username || body?.authorName || "Member"

  const thread = await createForumThread({
    categorySlug,
    title,
    summary,
    tags,
    body: content,
    authorId: discordId,
    authorName,
  })

  if (!thread) {
    return NextResponse.json({ error: "failed_to_create_thread" }, { status: 500 })
  }

  return NextResponse.json({ thread }, { status: 201 })
}
