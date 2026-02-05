import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CONTROL_PANEL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // For simplicity, return broadcasts from the last 60 seconds
    const broadcasts = await prisma.federationBroadcast.findMany({
      where: {
        createdAt: {
          gt: new Date(Date.now() - 60 * 1000),
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
    })

    return NextResponse.json(broadcasts)
  } catch (error) {
    console.error("Inbox error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
