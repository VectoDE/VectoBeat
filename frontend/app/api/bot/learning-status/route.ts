import { type NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getApiKeySecrets } from "@/lib/api-keys"
import { getLearningSummary } from "@/lib/auto-queue"

const SECRET_TYPES = ["status_api", "queue_sync"]

export async function GET(request: NextRequest) {
    const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: true })

    if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const guildId = searchParams.get("guildId")

    try {
        const summary = await getLearningSummary(guildId)
        return NextResponse.json({ success: true, ...summary })
    } catch (error) {
        console.error("[BotAPI] Failed to fetch learning status:", error)
        return NextResponse.json({ error: "internal_error" }, { status: 500 })
    }
}
