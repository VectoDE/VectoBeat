import { NextRequest, NextResponse } from "next/server"
import { getGuildSubscriptionTier, getScaleAccountContact, upsertScaleAccountContact } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { getApiKeySecrets } from "@/lib/api-keys"

const SECRET_TYPES = ["scale_contact_api_secret", "success_pod_api_secret", "server_settings", "status_api"]

const sanitize = (value?: string | null, max = 255) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

export async function GET(request: NextRequest) {
  const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: false })
  const header = request.headers.get("authorization")
  const token = header?.replace(/^Bearer\s+/i, "")
  if (!token || !secrets.includes(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
  if (!guildId) {
    return NextResponse.json({ error: "guildId_required" }, { status: 400 })
  }
  const tier = (await getGuildSubscriptionTier(guildId)) as MembershipTier
  const plan = getPlanCapabilities(tier)
  if (!plan.features.successPod) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }
  const contact = await getScaleAccountContact(guildId)
  return NextResponse.json({ contact })
}

export async function POST(request: NextRequest) {
  const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: false })
  const header = request.headers.get("authorization")
  const token = header?.replace(/^Bearer\s+/i, "")
  if (!token || !secrets.includes(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const guildId = sanitize(payload?.guildId, 32)
  if (!guildId) {
    return NextResponse.json({ error: "guildId_required" }, { status: 400 })
  }
  const tier = (await getGuildSubscriptionTier(guildId)) as MembershipTier
  const plan = getPlanCapabilities(tier)
  if (!plan.features.successPod) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const managerName = sanitize(payload?.managerName, 120) || null
  const managerEmail = sanitize(payload?.managerEmail, 120) || null
  const managerDiscord = sanitize(payload?.managerDiscord, 80) || null
  const escalationChannel = sanitize(payload?.escalationChannel, 160) || null
  const escalationNotesRaw = typeof payload?.escalationNotes === "string" ? payload.escalationNotes.trim() : ""
  const escalationNotes = escalationNotesRaw ? escalationNotesRaw.slice(0, 2000) : null

  const record = await upsertScaleAccountContact(guildId, {
    managerName,
    managerEmail,
    managerDiscord,
    escalationChannel,
    escalationNotes,
  })

  if (!record) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }

  return NextResponse.json({ contact: record })
}
