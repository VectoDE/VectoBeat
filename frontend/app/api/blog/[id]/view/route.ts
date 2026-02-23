import { type NextRequest, NextResponse } from "next/server"
import { incrementBlogPostView } from "@/lib/db"

type RouteParams = { params: Promise<{ id: string }> }

const sanitizeIdentifier = (value: string) => {
    try {
        return decodeURIComponent(value).trim()
    } catch {
        return value.trim()
    }
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
    const { id } = await params
    const identifier = sanitizeIdentifier(id)

    if (!identifier) {
        return NextResponse.json({ error: "missing identifier" }, { status: 400 })
    }

    try {
        await incrementBlogPostView(identifier)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[Blog View Tracker] Failed to increment view:", error)
        return NextResponse.json({ error: "internal_error" }, { status: 500 })
    }
}
