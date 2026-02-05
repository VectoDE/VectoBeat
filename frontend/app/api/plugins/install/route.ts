import { NextResponse } from "next/server"
import { getPrismaClient } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { pluginId, guildId, action } = body

    if (!pluginId || !guildId || !action) {
        return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const prisma = getPrismaClient()
    if (!prisma) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    if (action === "install") {
        // Check if plugin exists
        const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } })
        if (!plugin) {
            return NextResponse.json({ error: "Plugin not found" }, { status: 404 })
        }

        // Upsert installation
        const installation = await prisma.pluginInstallation.upsert({
            where: {
                pluginId_guildId: {
                    pluginId,
                    guildId
                }
            },
            update: {
                enabled: true
            },
            create: {
                pluginId,
                guildId,
                enabled: true
            }
        })

        // Increment download count
        await prisma.plugin.update({
            where: { id: pluginId },
            data: { downloads: { increment: 1 } }
        })

        return NextResponse.json(installation)
    } else if (action === "uninstall") {
        await prisma.pluginInstallation.deleteMany({
            where: {
                pluginId,
                guildId
            }
        })
        return NextResponse.json({ success: true })
    } else {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

  } catch (error) {
    console.error("Plugin Install Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
