import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CONTROL_PANEL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { instanceId, region, status, meta } = body

    if (!instanceId) {
      return NextResponse.json({ error: "Missing instanceId" }, { status: 400 })
    }

    await prisma.federationPeer.upsert({
      where: { instanceId },
      update: {
        region,
        status,
        lastSeen: new Date(),
        meta: meta || {},
      },
      create: {
        instanceId,
        region: region || "unknown",
        status: status || "online",
        lastSeen: new Date(),
        meta: meta || {},
      },
    })

    // Return list of active peers (seen in last 5 minutes)
    const activePeers = await prisma.federationPeer.findMany({
      where: {
        lastSeen: {
          gt: new Date(Date.now() - 5 * 60 * 1000),
        },
        instanceId: {
          not: instanceId, // Exclude self
        },
      },
      select: {
        instanceId: true,
        region: true,
        status: true,
        lastSeen: true,
      },
    })

    return NextResponse.json({ success: true, peers: activePeers })
  } catch (error) {
    console.error("Heartbeat error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
