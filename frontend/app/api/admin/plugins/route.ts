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

    const plugins = await prisma.plugin.findMany({
      orderBy: { createdAt: 'desc' }
    })
    
    return NextResponse.json(plugins)
  } catch (error) {
    console.error("Get Plugins Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, description, version, author, price, verified, enabled, configSchema } = body
    
    const prisma = getPrismaClient()
    if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 500 })

    const plugin = await prisma.plugin.create({
      data: {
        name,
        description,
        version,
        author,
        price,
        verified: verified ?? false,
        enabled: enabled ?? true,
        configSchema: configSchema ?? undefined,
      }
    })
    
    return NextResponse.json(plugin)
  } catch (error) {
    console.error("Create Plugin Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!await checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, name, description, version, author, price, verified, enabled, configSchema } = body
    
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const prisma = getPrismaClient()
    if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 500 })

    const plugin = await prisma.plugin.update({
      where: { id },
      data: {
        name,
        description,
        version,
        author,
        price,
        verified,
        enabled,
        configSchema: configSchema ?? undefined,
      }
    })
    
    return NextResponse.json(plugin)
  } catch (error) {
    console.error("Update Plugin Error:", error)
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

    await prisma.plugin.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete Plugin Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
