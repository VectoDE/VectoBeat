import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import { getPrismaClient } from "@/lib/prisma"

const isPrivileged = (role: string) => role === "admin" || role === "operator"

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params
    try {
        const { discordId } = await request.json()

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

        await prisma.userInfraction.delete({
            where: { id },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error(`[VectoBeat] Failed to revoke infraction ${id}:`, error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
