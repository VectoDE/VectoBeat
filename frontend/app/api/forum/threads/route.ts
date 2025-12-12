import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getUserSubscriptions,
  listForumCategories,
  listForumThreads,
  listForumPosts,
  createForumThread,
  getUserRole,
  updateForumThreadStatus,
} from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

const hasProPlus = (tiers: string[]) => tiers.some((tier) => ["pro", "growth", "scale", "enterprise"].includes(tier))
const MODERATOR_THREAD_STATUSES = ["open", "pinned", "archived", "locked", "resolved"]

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
  let isTeam = false
  if (discordId) {
    const auth = await verifyRequestForUser(request, discordId)
    if (auth.valid) {
      const role = await getUserRole(discordId)
      isTeam = ["admin", "operator"].includes(role)
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

  return NextResponse.json({ categories, threads, posts, pro: isPro, team: isTeam })
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
  const role = await getUserRole(discordId)
  const isTeam = ["admin", "operator"].includes(role)
  if (!isTeam && !hasProPlus(tiers)) {
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

export async function PATCH(request: NextRequest) {
  const body = await parseBody(request)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null
  const threadId = typeof body?.threadId === "string" ? body.threadId : null
  const statusRaw = typeof body?.status === "string" ? body.status : null
  if (!discordId || !threadId || !statusRaw) {
    return NextResponse.json({ error: "discordId, threadId, and status required" }, { status: 400 })
  }

  const normalizedStatus = statusRaw.trim().toLowerCase()
  if (!MODERATOR_THREAD_STATUSES.includes(normalizedStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const thread = await updateForumThreadStatus(threadId, normalizedStatus)
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, thread })
}
