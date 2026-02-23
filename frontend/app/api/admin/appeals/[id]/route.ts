import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import { getPrismaClient } from "@/lib/prisma"

const isPrivileged = (role: string) => role === "admin" || role === "operator"

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params
    try {
        const { discordId, status } = await request.json()

        if (!discordId || !status) {
            return NextResponse.json({ error: "discordId and status are required" }, { status: 400 })
        }

        if (!["accepted", "rejected"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 })
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

        // Update appeal status
        const appeal = await prisma.banAppeal.update({
            where: { id },
            data: { status },
            include: { infraction: true }
        })

        // If accepted, revoke the ban (delete the infraction)
        if (status === "accepted" && appeal.infractionId) {
            await prisma.userInfraction.delete({
                where: { id: appeal.infractionId }
            })
            // NOTE: Due to onDelete: Cascade in Prisma schema, the appeal record itself 
            // will also be deleted if it was linked to this infraction.
            // If history preservation is needed, the schema would need to be adjusted.
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error(`[VectoBeat] Failed to update appeal ${id}:`, error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
