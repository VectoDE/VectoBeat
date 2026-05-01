import { NextResponse, type NextRequest } from "next/server"
import { checkAdmin } from "@/lib/auth"
import { getPrismaClient } from "@/lib/db"

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
