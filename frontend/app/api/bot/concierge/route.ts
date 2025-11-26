import { NextRequest, NextResponse } from "next/server"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import {
  getConciergeUsage,
  recordConciergeRequest,
  resolveConciergeRequest,
  getGuildSubscriptionTier,
} from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"

const SECRETS = expandSecrets(
  process.env.CONCIERGE_API_SECRET,
  process.env.SERVER_SETTINGS_API_KEY,
  process.env.BOT_STATUS_API_KEY,
  process.env.AUTOMATION_LOG_SECRET,
)

const sanitize = (value: unknown, max = 255) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

type RouteDeps = {
  secret?: string
  fetchUsage?: typeof getConciergeUsage
  saveRequest?: typeof recordConciergeRequest
  markResolved?: typeof resolveConciergeRequest
  fetchTier?: typeof getGuildSubscriptionTier
}

export const createBotConciergeHandlers = (deps: RouteDeps = {}) => {
  const secrets = deps.secret ? expandSecrets(deps.secret) : SECRETS
  const fetchUsage = deps.fetchUsage ?? getConciergeUsage
  const saveRequest = deps.saveRequest ?? recordConciergeRequest
  const markResolved = deps.markResolved ?? resolveConciergeRequest
  const fetchTier = deps.fetchTier ?? getGuildSubscriptionTier

  const getHandler = async (request: NextRequest) => {
    if (!authorizeRequest(request, secrets)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    const action = sanitize(request.nextUrl.searchParams.get("action"), 16).toLowerCase() || "usage"
    const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
    if (!guildId) {
      return NextResponse.json({ error: "guildId_required" }, { status: 400 })
    }
    if (action !== "usage") {
      return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
    }

    const tier = (await fetchTier(guildId)) as MembershipTier
    const plan = getPlanCapabilities(tier)
    if (!plan.features.concierge) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }

    const usage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
    return NextResponse.json({ usage, tier })
  }

  const postHandler = async (request: NextRequest) => {
    if (!authorizeRequest(request, secrets)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    let payload: any
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }
    const action = sanitize(payload?.action, 16).toLowerCase()
    const guildId = sanitize(payload?.guildId, 32)
    if (!action) {
      return NextResponse.json({ error: "action_required" }, { status: 400 })
    }
    if (!guildId) {
      return NextResponse.json({ error: "guildId_required" }, { status: 400 })
    }

    const tier = (await fetchTier(guildId)) as MembershipTier
    const plan = getPlanCapabilities(tier)
    if (!plan.features.concierge) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }

    if (action === "create") {
      const contact = sanitize(payload?.contact, 120)
      const summary = sanitize(payload?.summary, 2000)
      const hoursRequested = Number(payload?.hours)
      const actorName = sanitize(payload?.actorName, 120)
      const actorId = sanitize(payload?.actorId, 64)
      const source = sanitize(payload?.source, 64) || "bot"

      if (!summary) {
        return NextResponse.json({ error: "summary_required" }, { status: 400 })
      }

      const usage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
      const allowedHours =
        typeof hoursRequested === "number" && Number.isFinite(hoursRequested) ? Math.max(1, hoursRequested) : 1
      const hours =
        plan.limits.conciergeHours === null
          ? Math.max(1, Math.min(8, allowedHours))
          : Math.max(1, Math.min(plan.limits.conciergeHours, allowedHours))
      if (plan.limits.conciergeHours !== null && usage.remaining !== null && usage.remaining - hours < 0) {
        return NextResponse.json(
          { error: "quota_exceeded", remaining: usage.remaining, total: usage.total },
          { status: 429 },
        )
      }

      const slaMinutes = plan.concierge.slaMinutes ?? 240
      const record = await saveRequest({
        guildId,
        tier,
        contact,
        summary,
        hours,
        slaMinutes,
        createdAt: new Date(),
      })

      const nextUsage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
      return NextResponse.json({
        ok: true,
        requestId: record?.id ?? null,
        usage: nextUsage,
        actor: actorName || actorId || null,
        source,
      })
    }

    if (action === "resolve") {
      const requestId = sanitize(payload?.requestId, 64)
      if (!requestId) {
        return NextResponse.json({ error: "requestId_required" }, { status: 400 })
      }
      const actor = sanitize(payload?.actorName, 120) || null
      const actorId = sanitize(payload?.actorId, 64) || null
      const note = sanitize(payload?.note, 2000) || null
      const resolved = await markResolved({ requestId, guildId, actor, actorId, note })
      if (!resolved) {
        return NextResponse.json({ error: "not_found" }, { status: 404 })
      }
      const nextUsage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
      return NextResponse.json({ ok: true, usage: nextUsage, requestId })
    }

    if (action === "usage") {
      return getHandler(request)
    }

    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  return { GET: getHandler, POST: postHandler }
}

const defaultHandlers = createBotConciergeHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST
