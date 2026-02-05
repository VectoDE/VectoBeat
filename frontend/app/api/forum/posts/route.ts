import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { createForumPost, getUserSubscriptions, getUserRole, type SubscriptionSummary } from "@/lib/db"
import { normalizeTierId } from "@/lib/memberships"

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
  const tiers = subs.map((sub: SubscriptionSummary) => normalizeTierId(sub.tier))
  const isPro = tiers.some((tier: string) => ["pro", "growth", "scale", "enterprise"].includes(tier))
  const roleName = await getUserRole(discordId)
  const isTeam = ["admin", "operator"].includes(roleName)
  const hasPostingRights = isTeam || isPro

  const threadId = typeof body?.threadId === "string" ? body.threadId : null
  const content = typeof body?.body === "string" ? body.body : null
  const requestedRole = typeof body?.role === "string" ? body.role : "member"
  const authorName = auth.user?.username || body?.authorName || "Member"

  if (!hasPostingRights) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 })
  }

  if (!threadId || !content) {
    return NextResponse.json({ error: "threadId and body required" }, { status: 400 })
  }

  const storedRole = isTeam ? roleName : requestedRole
  const post = await createForumPost({
    threadId,
    body: content,
    authorId: discordId,
    authorName,
    role: storedRole,
  })

  if (!post) {
    return NextResponse.json({ error: "failed_to_create_post" }, { status: 500 })
  }

  return NextResponse.json({ post }, { status: 201 })
}
