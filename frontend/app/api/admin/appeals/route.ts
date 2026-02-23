import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import { getPrismaClient } from "@/lib/prisma"

const isPrivileged = (role: string) => role === "admin" || role === "operator"

export async function GET(request: NextRequest) {
    try {
        const discordId = request.nextUrl.searchParams.get("discordId")
        if (!discordId) {
            return NextResponse.json({ error: "discordId is required" }, { status: 400 })
        }

        const auth = await verifyRequestForUser(request, discordId)
        if (!auth.valid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const role = await getUserRole(discordId)
        if (!isPrivileged(role)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
        }

        const prisma = getPrismaClient()
        if (!prisma) {
            return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
        }

        const appeals = await prisma.banAppeal.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
        })

        return NextResponse.json({ appeals })
    } catch (error) {
        console.error("[VectoBeat] Failed to fetch appeals:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
