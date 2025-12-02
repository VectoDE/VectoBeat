import { type NextRequest, NextResponse } from "next/server"
import { getBlogPostByIdentifier, getBlogPosts, getUserRole, saveBlogPost, recordBotActivityEvent } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"
import { sendBlogPostAnnouncement } from "@/lib/email-notifications"

export async function GET() {
  const posts = await getBlogPosts()
  return NextResponse.json({ posts })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { discordId, ...postInput } = body || {}

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

  if (!postInput?.slug || !postInput?.title || !postInput?.content || !postInput?.author) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const existing = await getBlogPostByIdentifier(postInput.slug)
  const post = await saveBlogPost(postInput)
  await recordBotActivityEvent({
    type: "blog.post",
    name: postInput.slug,
    guildId: null,
    success: true,
    metadata: { title: postInput.title, author: postInput.author },
  })
  if (post && !existing) {
    try {
      void sendBlogPostAnnouncement({
        postTitle: post.title,
        slug: post.slug ?? post.id,
        excerpt: post.excerpt || undefined,
      })
    } catch (error) {
      console.error("[VectoBeat] Failed to dispatch blog announcement:", error)
    }
  }
  return NextResponse.json({ post })
}
