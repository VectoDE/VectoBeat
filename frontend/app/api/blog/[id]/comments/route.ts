import { type NextRequest, NextResponse } from "next/server"
import { addBlogComment, getBlogComments, recordBotActivityEvent } from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

type ParamsInput = Promise<{ id: string }> | { id: string }

const resolveParams = async (params: ParamsInput) =>
  typeof (params as any)?.then === "function" ? await params : params

export async function GET(_request: NextRequest, ctx: { params: ParamsInput }) {
  const { id } = await resolveParams(ctx.params)
  const comments = await getBlogComments(id)
  return NextResponse.json({ comments })
}

export async function POST(request: NextRequest, ctx: { params: ParamsInput }) {
  try {
    const { id } = await resolveParams(ctx.params)
    const body = await request.json()
    const discordId = typeof body?.discordId === "string" ? body.discordId : null
    const author = typeof body?.author === "string" ? body.author : ""
    const message = typeof body?.message === "string" ? body.message : ""

    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    if (!author.trim() || !message.trim()) {
      return NextResponse.json({ error: "Name and comment are required" }, { status: 400 })
    }

    const comment = await addBlogComment(id, discordId, author, message)
    if (!comment) {
      return NextResponse.json({ error: "Unable to save comment" }, { status: 400 })
    }

    await recordBotActivityEvent({
      type: "blog.comment",
      name: id,
      guildId: null,
      success: true,
      metadata: { author, discordId },
    })

    return NextResponse.json({ comment })
  } catch (_error) {
    return NextResponse.json({ error: "Unable to process comment" }, { status: 500 })
  }
}
