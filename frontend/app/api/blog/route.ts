import { type NextRequest, NextResponse } from "next/server"
import { getBlogPosts, getUserRole, saveBlogPost } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

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

  const post = await saveBlogPost(postInput)
  return NextResponse.json({ post })
}
