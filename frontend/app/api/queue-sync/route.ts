import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getApiKeySecrets } from "@/lib/api-keys"
import { setQueueSnapshot } from "@/lib/queue-sync-store"
import type { QueueSnapshot } from "@/types/queue-sync"

const AUTH_TOKEN_TYPES = ["queue_sync", "control_panel", "status_api", "status_events"]

export async function POST(request: NextRequest) {
    const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: true })
    if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    let payload: unknown
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }

    if (!payload || typeof payload !== "object") {
        return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    }

    const body = payload as Record<string, unknown>
    const guildId = typeof body.guildId === "string" ? body.guildId.trim() : ""
    if (!guildId) {
        return NextResponse.json({ error: "guildId_required" }, { status: 400 })
    }

    const snapshot: QueueSnapshot = {
        guildId,
        nowPlaying: (body.nowPlaying as QueueSnapshot["nowPlaying"]) ?? null,
        queue: Array.isArray(body.queue) ? (body.queue as QueueSnapshot["queue"]) : [],
        paused: typeof body.paused === "boolean" ? body.paused : false,
        volume: typeof body.volume === "number" ? body.volume : null,
        updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
    }

    try {
        await setQueueSnapshot(snapshot)
        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("[VectoBeat] Queue sync ingest failed:", error)
        return NextResponse.json({ error: "unavailable" }, { status: 500 })
    }
}
