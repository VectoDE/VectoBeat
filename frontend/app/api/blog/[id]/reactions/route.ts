import { type NextRequest, NextResponse } from "next/server"
import { getBlogReactions, recordBlogReaction, getBlogReactionForUser, type BlogReactionType, recordBotActivityEvent } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

type ParamsInput = Promise<{ id: string }> | { id: string }

const resolveParams = async (params: ParamsInput) => {
  return typeof (params as any)?.then === "function" ? await params : params
}

export async function GET(request: NextRequest, ctx: { params: ParamsInput }) {
  const { id } = await resolveParams(ctx.params)
  const url = request.nextUrl
  const discordId = url.searchParams.get("discordId")
  let userReaction: BlogReactionType | null = null

  if (discordId) {
    const auth = await verifyRequestForUser(request, discordId)
    if (auth.valid) {
      userReaction = await getBlogReactionForUser(id, discordId)
    }
  }

  const reactions = await getBlogReactions(id)
  return NextResponse.json({ reactions, userReaction })
}

export async function POST(request: NextRequest, ctx: { params: ParamsInput }) {
  try {
    const { id } = await resolveParams(ctx.params)
    const body = await request.json()
    const reaction = body?.reaction as BlogReactionType | undefined
    const discordId = typeof body?.discordId === "string" ? body.discordId : null

    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    if (!reaction || !["up", "down"].includes(reaction)) {
      return NextResponse.json({ error: "Invalid reaction" }, { status: 400 })
    }

    const result = await recordBlogReaction(id, discordId, reaction)
    await recordBotActivityEvent({
      type: "blog.reaction",
      name: id,
      guildId: null,
      success: true,
      metadata: { discordId, reaction, alreadyReacted: result.alreadyReacted },
    })
    return NextResponse.json({
      reactions: result.summary,
      alreadyReacted: result.alreadyReacted,
      userReaction: result.userReaction,
    })
  } catch (_error) {
    return NextResponse.json({ error: "Unable to process reaction" }, { status: 500 })
  }
}
