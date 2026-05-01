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

        const requests = await prisma.dataExportRequest.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
        })

        return NextResponse.json(requests)
    } catch (error) {
        console.error("Get Data Export Requests Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
