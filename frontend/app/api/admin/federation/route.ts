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

        const instances = await prisma.botInstance.findMany({
            orderBy: { lastHeartbeat: "desc" },
        })

        return NextResponse.json(instances)
    } catch (error) {
        console.error("Get Federation Instances Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    if (!await checkAdmin(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const id = req.nextUrl.searchParams.get("id")
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

        const prisma = getPrismaClient()
        if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 500 })

        await prisma.botInstance.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Delete Federation Instance Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
