import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getApiKeySecrets } from "@/lib/api-keys"
import { getRecommendedTracks } from "@/lib/auto-queue"

const SECRET_TYPES = ["status_api", "queue_sync"]

export async function GET(request: NextRequest) {
    const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: true })

    if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const seedTrackId = searchParams.get("seedTrackId")
    const limitStr = searchParams.get("limit")
    const limit = limitStr ? parseInt(limitStr, 10) : 5

    if (!seedTrackId) {
        return NextResponse.json({ error: "seedTrackId_required" }, { status: 400 })
    }

    try {
        const tracks = await getRecommendedTracks(seedTrackId, limit)
        return NextResponse.json({
            success: true,
            tracks: tracks.map(t => ({
                id: t.id,
                title: t.title,
                artist: t.artist,
                genre: t.genre,
                source: t.source,
                sourceId: t.sourceId,
                metadata: t.metadata
            }))
        })
    } catch (error) {
        console.error("[BotAPI] Failed to fetch recommendations:", error)
        return NextResponse.json({ error: "internal_error" }, { status: 500 })
    }
}
