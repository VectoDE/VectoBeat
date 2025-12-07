import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, rotateApiCredential } from "@/lib/db"

const isPrivileged = (role: string) => role === "admin" || role === "operator"

type RequestPayload = {
  ticketId?: string | null
  label?: string | null
  requesterId?: string | null
  requesterEmail?: string | null
  requesterName?: string | null
}

export async function POST(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId") || ""
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const role = await getUserRole(discordId)
  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as RequestPayload | null
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : null
  const requesterId = typeof body?.requesterId === "string" ? body.requesterId.trim() : null
  const requesterEmail = typeof body?.requesterEmail === "string" ? body.requesterEmail.trim() : null
  const requesterName = typeof body?.requesterName === "string" ? body.requesterName.trim() : null
  const label =
    (typeof body?.label === "string" && body.label.trim()) ||
    (requesterEmail ? `Developer API Key (${requesterEmail})` : "Developer API Key")

  const token = randomBytes(32).toString("hex")

  const record = await rotateApiCredential({
    type: "developer_api_key",
    value: token,
    label,
    createdBy: discordId,
    metadata: {
      ticketId,
      requesterId,
      requesterEmail,
      requesterName,
    },
  })

  if (!record) {
    return NextResponse.json({ error: "unable_to_generate_key" }, { status: 500 })
  }

  return NextResponse.json({
    token,
    credential: {
      id: record.id,
      label: record.label,
      createdAt: record.createdAt,
      metadata: record.metadata ?? null,
    },
  })
}
