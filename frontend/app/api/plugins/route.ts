import { NextResponse } from "next/server"
import { getPrismaClient } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get("guildId")

  const prisma = getPrismaClient()
  if (!prisma) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 })
  }

  try {
    const plugins = await prisma.plugin.findMany({
      where: {
        enabled: true
      },
      orderBy: {
        downloads: 'desc'
      },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        author: true,
        price: true,
        downloads: true,
        rating: true,
        verified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (guildId) {
        const installations = await prisma.pluginInstallation.findMany({
            where: { guildId }
        })
        const installedIds = new Set(installations.map((i: { pluginId: string }) => i.pluginId))
        
        const pluginsWithStatus = plugins.map((p: any) => ({
            ...p,
            installed: installedIds.has(p.id)
        }))
        return NextResponse.json(pluginsWithStatus)
    }
    
    return NextResponse.json(plugins)
  } catch (error) {
    console.error("Plugins Fetch Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
