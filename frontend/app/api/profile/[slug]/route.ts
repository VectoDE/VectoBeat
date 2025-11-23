import { NextResponse } from "next/server"
import { getPublicProfileBySlug } from "@/lib/db"

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const safeSlug = slug?.trim()
  if (!safeSlug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 })
  }

  const profile = await getPublicProfileBySlug(safeSlug)
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }
  if ("restricted" in profile) {
    return NextResponse.json({ error: "Profile is private" }, { status: 403 })
  }

  return NextResponse.json(profile)
}
