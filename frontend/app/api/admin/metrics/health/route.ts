import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { verifyRequestForUser } from "@/lib/auth"
import { getPrismaClient, getUserRole } from "@/lib/db"

const checkAdmin = async (req: NextRequest) => {
    const cookieStore = await cookies()
    const discordId =
        cookieStore.get("discord_user_id")?.value ||
        cookieStore.get("discord_id")?.value ||
        cookieStore.get("discordId")?.value ||
        req.nextUrl.searchParams.get("discordId")

    if (!discordId) return false

    const verification = await verifyRequestForUser(req, discordId)
    if (!verification.valid) return false

    const role = await getUserRole(discordId)
    return role === "admin" || role === "operator"
}

export async function GET(req: NextRequest) {
    if (!await checkAdmin(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const prisma = getPrismaClient()
        if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 500 })

        const snapshots = await prisma.botMetricSnapshot.findMany({
            orderBy: { recordedAt: "asc" },
            take: 100,
        })

        return NextResponse.json(snapshots)
    } catch (error) {
        console.error("Get Health Metrics Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
