import { NextRequest, NextResponse } from "next/server"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import {
  getSuccessPodRequests,
  recordSuccessPodRequest,
  progressSuccessPodRequest,
  getGuildSubscriptionTier,
} from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"

const SECRETS = expandSecrets(
  process.env.SUCCESS_POD_API_SECRET,
  process.env.AUTOMATION_LOG_SECRET,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
)

const sanitize = (value?: string | null, max = 255) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

export async function GET(request: NextRequest) {
  if (!authorizeRequest(request, SECRETS)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
  if (!guildId) {
    return NextResponse.json({ error: "guildId_required" }, { status: 400 })
  }
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 10
  const requests = await getSuccessPodRequests(guildId, limit)
  return NextResponse.json({ requests })
}

export async function POST(request: NextRequest) {
  if (!authorizeRequest(request, SECRETS)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const action = typeof payload?.action === "string" ? payload.action.toLowerCase() : ""
  if (!action) {
    return NextResponse.json({ error: "action_required" }, { status: 400 })
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

  if (action === "create") {
    const summary = sanitize(payload?.summary, 3000)
    if (!summary) {
      return NextResponse.json({ error: "summary_required" }, { status: 400 })
    }
    const contact = sanitize(payload?.contact, 120)
    const guildName = sanitize(payload?.guildName, 120) || "Unnamed Guild"
    const createdBy = sanitize(payload?.createdBy, 64)
    const source = sanitize(payload?.source, 64) || "bot"
    const requestRecord = await recordSuccessPodRequest({
      guildId,
      guildName,
      contact,
      summary,
      createdBy: createdBy || null,
      source,
      tier,
    })
    if (!requestRecord) {
      return NextResponse.json({ error: "unable_to_create" }, { status: 500 })
    }
    return NextResponse.json({ request: requestRecord })
  }

  const requestId = sanitize(payload?.requestId, 64)
  if (!requestId) {
    return NextResponse.json({ error: "requestId_required" }, { status: 400 })
  }

  const actor = sanitize(payload?.actor, 120) || null
  const actorId = sanitize(payload?.actorId, 64) || null
  const noteValue = sanitize(payload?.note, 2000)
  const note = noteValue || null
  const assignedTo =
    typeof payload?.assignedTo === "string" ? sanitize(payload.assignedTo, 120) : undefined
  const assignedContact =
    typeof payload?.assignedContact === "string" ? sanitize(payload.assignedContact, 120) : undefined
  let scheduledFor: Date | null = null
  if (payload?.scheduledFor) {
    const parsed = new Date(payload.scheduledFor)
    if (!Number.isNaN(parsed.getTime())) {
      scheduledFor = parsed
    }
  }
  const resolutionNoteRaw =
    typeof payload?.resolutionNote === "string" ? sanitize(payload.resolutionNote, 1000) : ""
  const resolutionNote = resolutionNoteRaw || undefined

  const normalizedAction =
    action === "ack"
      ? "acknowledged"
      : action === "acknowledge"
        ? "acknowledged"
        : action === "schedule"
          ? "scheduled"
          : action === "resolve"
            ? "resolved"
            : action

  if (!["acknowledged", "scheduled", "resolved"].includes(normalizedAction)) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const updated = await progressSuccessPodRequest({
    requestId,
    guildId,
    action: normalizedAction as "acknowledged" | "scheduled" | "resolved",
    actor,
    actorId,
    note,
    assignedTo,
    assignedContact,
    scheduledFor,
    resolutionNote,
  })
  if (!updated) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }
  return NextResponse.json({ request: updated })
}
