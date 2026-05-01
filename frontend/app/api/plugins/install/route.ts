import { NextRequest, NextResponse } from "next/server"
import { resolveDiscordId, verifyRequestForUser } from "@/lib/auth"
import { getPrismaClient } from "@/lib/db"
import { sanitizeField } from "@/lib/security"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const pluginId = sanitizeField(body.pluginId, 100)
    const guildId = sanitizeField(body.guildId, 100)
    const action = sanitizeField(body.action, 20)

    if (!pluginId || !guildId || !action) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    if (action !== "install" && action !== "uninstall") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const discordId = await resolveDiscordId(req)
    if (!discordId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const auth = await verifyRequestForUser(req, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 })
    }

    const prisma = getPrismaClient()
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    if (action === "install") {
      const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } })
      if (!plugin) {
        return NextResponse.json({ error: "Plugin not found" }, { status: 404 })
      }

      const installation = await prisma.pluginInstallation.upsert({
        where: {
          pluginId_guildId: {
            pluginId,
            guildId,
          },
        },
        update: {
          enabled: true,
        },
        create: {
          pluginId,
          guildId,
          enabled: true,
        },
      })

      await prisma.plugin.update({
        where: { id: pluginId },
        data: { downloads: { increment: 1 } },
      })

      return NextResponse.json(installation)
    } else {
      await prisma.pluginInstallation.deleteMany({
        where: {
          pluginId,
          guildId,
        },
      })
      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error("Plugin Install Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
