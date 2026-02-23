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

        const settings = await prisma.enterpriseSetting.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
        })

        return NextResponse.json(settings)
    } catch (error) {
        console.error("Get Enterprise Settings Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    if (!await checkAdmin(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { guildId, domain, ssoEnabled, ssoProvider, ssoConfig, branding } = body

        if (!guildId) return NextResponse.json({ error: "guildId is required" }, { status: 400 })

        const prisma = getPrismaClient()
        if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 500 })

        const setting = await prisma.enterpriseSetting.upsert({
            where: { guildId },
            update: {
                domain,
                ssoEnabled: ssoEnabled ?? false,
                ssoProvider,
                ssoConfig: ssoConfig ?? undefined,
                branding: branding ?? undefined,
            },
            create: {
                guildId,
                domain,
                ssoEnabled: ssoEnabled ?? false,
                ssoProvider,
                ssoConfig: ssoConfig ?? undefined,
                branding: branding ?? undefined,
            }
        })

        return NextResponse.json(setting)
    } catch (error) {
        console.error("Upsert Enterprise Settings Error:", error)
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

        await prisma.enterpriseSetting.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Delete Enterprise Settings Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
