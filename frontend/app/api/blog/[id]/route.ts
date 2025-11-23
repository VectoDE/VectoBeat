import { type NextRequest, NextResponse } from "next/server"
import {
  getBlogPostByIdentifier,
  getBlogPosts,
  getBlogReactions,
  getBlogComments,
  type BlogPost,
  type BlogReactionSummary,
  type BlogComment,
} from "@/lib/db"

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
