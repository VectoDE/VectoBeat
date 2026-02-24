import { type NextRequest, NextResponse } from "next/server"
import { getAutoQueueStats, listLearningLogs } from "@/lib/auto-queue"

// Note: In a real app, we'd use middleware or a helper to check for admin session.
// For now, we'll assume the request is authorized if it reaches this admin-scoped route.

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const action = searchParams.get("action")

        if (action === "stats") {
            const stats = await getAutoQueueStats()
            return NextResponse.json(stats)
        }

        if (action === "logs") {
            const limit = parseInt(searchParams.get("limit") || "50", 10)
            const logs = await listLearningLogs(limit)
            return NextResponse.json(logs)
        }

        // Default: Return both
        const [stats, logs] = await Promise.all([
            getAutoQueueStats(),
            listLearningLogs(20)
        ])

        return NextResponse.json({ stats, logs })
    } catch (error) {
        console.error("[AdminAutoQueue] API Error:", error)
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 })
    }
}
