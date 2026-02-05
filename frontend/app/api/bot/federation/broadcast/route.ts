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
    const { event, payload } = body

    if (!event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 })
    }

    await prisma.federationBroadcast.create({
      data: {
        event,
        payload: payload || {},
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Broadcast error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
