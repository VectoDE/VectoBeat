import { type NextRequest, NextResponse } from "next/server"
import { checkAdmin } from "@/lib/auth"
import {
    getAutoQueueStats,
    listLearningLogs,
    analyzeTrends,
    getImprovementSuggestions,
    getLearningSummary,
} from "@/lib/auto-queue"

export async function GET(request: NextRequest) {
    const isAdmin = await checkAdmin(request)
    if (!isAdmin) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

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

        if (action === "trends") {
            const guildId = searchParams.get("guildId")
            const days = parseInt(searchParams.get("days") || "30", 10)
            const trends = await analyzeTrends(guildId, days)
            return NextResponse.json(trends)
        }

        if (action === "suggestions") {
            const suggestions = await getImprovementSuggestions()
            return NextResponse.json(suggestions)
        }

        if (action === "summary") {
            const guildId = searchParams.get("guildId")
            const summary = await getLearningSummary(guildId)
            return NextResponse.json(summary)
        }

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
