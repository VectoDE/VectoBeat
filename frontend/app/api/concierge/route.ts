import { NextResponse, type NextRequest } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getGuildSubscriptionTier,
  recordConciergeRequest,
  getConciergeUsage,
  getServerSettings,
  getUserSubscriptions,
} from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { sendNotificationEmail } from "@/lib/mailer"
import { getPlanCapabilities } from "@/lib/plan-capabilities"

const CONCIERGE_EMAIL = process.env.SUCCESS_POD_EMAIL || process.env.SMTP_FROM || "timhauke@uplytech.de"

const sanitize = (value?: string, max = 500) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchUserSubscriptions?: typeof getUserSubscriptions
  fetchGuildTier?: typeof getGuildSubscriptionTier
  fetchUsage?: typeof getConciergeUsage
  saveRequest?: typeof recordConciergeRequest
  fetchSettings?: typeof getServerSettings
  notify?: typeof sendNotificationEmail
}

const resolveMembershipForGuild = async (
  discordId: string,
  guildId: string,
  fetchUserSubscriptions: typeof getUserSubscriptions,
  fetchGuildTier: typeof getGuildSubscriptionTier,
) => {
  const subscriptions = await fetchUserSubscriptions(discordId)
  const membership = subscriptions.find(
    (sub) => sub.discordServerId === guildId && sub.status === "active",
  )
  if (membership) {
    return { tier: membership.tier as MembershipTier, ok: true as const }
  }
  // Fall back to guild tier lookup while still signaling lack of membership for this user.
  const guildTier = await fetchGuildTier(guildId)
  return { tier: guildTier as MembershipTier, ok: false as const }
}

export const createConciergeHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchUserSubscriptions = deps.fetchUserSubscriptions ?? getUserSubscriptions
  const fetchGuildTier = deps.fetchGuildTier ?? getGuildSubscriptionTier
  const fetchUsage = deps.fetchUsage ?? getConciergeUsage
  const saveRequest = deps.saveRequest ?? recordConciergeRequest
  const fetchSettings = deps.fetchSettings ?? getServerSettings
  const notify = deps.notify ?? sendNotificationEmail

  const getHandler = async (request: NextRequest) => {
    const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
    const discordId = sanitize(request.nextUrl.searchParams.get("discordId"), 32)
    if (!guildId || !discordId) {
      return NextResponse.json({ error: "guildId_and_discordId_required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const membership = await resolveMembershipForGuild(discordId, guildId, fetchUserSubscriptions, fetchGuildTier)
    if (!membership.ok) {
      return NextResponse.json({ error: "guild_not_accessible" }, { status: 403 })
    }

    const plan = getPlanCapabilities(membership.tier)
    if (!plan.features.concierge) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }
    const usage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
    return NextResponse.json({ usage, tier: membership.tier })
  }

  const postHandler = async (request: NextRequest) => {
    try {
      const body = await request.json()
      const guildId = sanitize(body?.guildId, 32)
      const discordId = sanitize(body?.discordId, 32)
      const guildName = sanitize(body?.guildName, 120) || "Unnamed Guild"
      const contact = sanitize(body?.contact, 120)
      const summary = sanitize(body?.summary, 2000)
      const requestedHours = Number(body?.hours)

      if (!guildId || !discordId || !summary) {
        return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
      }

      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      const membership = await resolveMembershipForGuild(discordId, guildId, fetchUserSubscriptions, fetchGuildTier)
      if (!membership.ok) {
        return NextResponse.json({ error: "guild_not_accessible" }, { status: 403 })
      }

      const plan = getPlanCapabilities(membership.tier)
      if (!plan.features.concierge) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      const settings = await fetchSettings(guildId)
      const usage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)
      const allowedHours =
        typeof requestedHours === "number" && Number.isFinite(requestedHours) ? Math.max(1, requestedHours) : 1
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
      tier: membership.tier,
      contact,
      summary,
      hours,
      slaMinutes,
    })

    const html = `
      <p><strong>Request ID:</strong> ${record?.id ?? "pending"}</p>
      <p><strong>Guild:</strong> ${guildName} (${guildId})</p>
      <p><strong>Plan:</strong> ${membership.tier}</p>
      <p><strong>Contact:</strong> ${contact || "Not provided"}</p>
      <p><strong>Hours Requested:</strong> ${hours}</p>
      <p><strong>SLA:</strong> ${slaMinutes} minutes</p>
      <p><strong>Request:</strong></p>
      <p>${summary.replace(/\n/g, "<br/>")}</p>
    `
      const mailFrom =
        typeof (settings as any)?.mailFromAddress === "string" && (settings as any).mailFromAddress?.trim()
          ? (settings as any).mailFromAddress.trim()
          : undefined
      await notify({
        to: CONCIERGE_EMAIL,
        subject: `[Concierge] ${guildName} (${membership.tier}) • ${record?.id ?? "new"}`,
        preview: summary.slice(0, 120),
        html,
        from: mailFrom,
      })

      const nextUsage = await fetchUsage(guildId, 30, plan.limits.conciergeHours ?? null)

      return NextResponse.json({
        ok: true,
        requestId: record?.id ?? null,
        usage: nextUsage,
        slaMinutes,
      })
    } catch (error) {
      console.error("[VectoBeat] Concierge request failed:", error)
      return NextResponse.json({ error: "server_error" }, { status: 500 })
    }
  }

  return { GET: getHandler, POST: postHandler }
}

const defaultHandlers = createConciergeHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST
