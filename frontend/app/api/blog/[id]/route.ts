import { type NextRequest, NextResponse } from "next/server"
import {
  getUserRole,
  saveBlogPost,
  deleteBlogPost,
  getBlogPostByIdentifier,
  getBlogPosts,
  getBlogReactions,
  getBlogComments,
  type BlogPost,
  type BlogReactionSummary,
  type BlogComment,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

type RouteParams = { params: Promise<{ id: string }> }

const sanitizeIdentifier = (value: string) => {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const identifier = sanitizeIdentifier(id)
  if (!identifier) {
    return NextResponse.json({ error: "missing identifier" }, { status: 400 })
  }

  const post = await getBlogPostByIdentifier(identifier)
  if (!post) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const [allPosts, reactions, comments] = await Promise.all([
    getBlogPosts(),
    getBlogReactions(post.slug ?? post.id),
    getBlogComments(post.slug ?? post.id),
  ])

  const relatedPosts = allPosts
    .filter((item) => item.id !== post.id && item.category === post.category)
    .slice(0, 3)

  return NextResponse.json<{
    post: BlogPost
    relatedPosts: BlogPost[]
    reactions: BlogReactionSummary
    comments: BlogComment[]
  }>({
    post,
    relatedPosts,
    reactions,
    comments,
  })
}
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const identifier = sanitizeIdentifier(id)
    if (!identifier) {
      return NextResponse.json({ error: "missing identifier" }, { status: 400 })
    }

    const { discordId } = await request.json().catch(() => ({}))
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (role !== "admin" && role !== "operator") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const success = await deleteBlogPost(identifier)
    if (!success) {
      return NextResponse.json({ error: "Post not found or delete failed" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[VectoBeat] Blog DELETE error:", error)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const identifier = sanitizeIdentifier(id)
    if (!identifier) {
      return NextResponse.json({ error: "missing identifier" }, { status: 400 })
    }

    const body = await request.json()
    const { discordId, ...updates } = body || {}

    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (role !== "admin" && role !== "operator") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const post = await saveBlogPost({ id: identifier, ...updates } as any)
    if (!post) {
      return NextResponse.json({ error: "Update failed" }, { status: 404 })
    }

    return NextResponse.json({ post })
  } catch (error) {
    console.error("[VectoBeat] Blog PATCH error:", error)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
