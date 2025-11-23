import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  return NextResponse.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: typeof process.pid === "number" ? process.pid : null,
    uptimeSeconds: typeof process.uptime === "function" ? Math.round(process.uptime()) : null,
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || process.env.FLY_REGION || null,
  })
}
