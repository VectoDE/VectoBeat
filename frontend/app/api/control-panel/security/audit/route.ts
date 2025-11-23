import { NextResponse, type NextRequest } from "next/server"
import { listSecurityAuditEvents } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureSecurityAccess = (tier: MembershipTier) => getPlanCapabilities(tier).serverSettings.exportWebhooks

const parseDate = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

const normalizeType = (value: string | null) => {
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === "command" || lower === "api" || lower === "admin") {
    return lower
  }
  return null
}

const toCsv = (events: Awaited<ReturnType<typeof listSecurityAuditEvents>>) => {
  if (!events.length) {
    return "timestamp,type,source,actorName,actorId,description"
  }
  const header = "timestamp,type,source,actorName,actorId,description"
  const rows = events.map((event) => {
    const cols = [
      event.createdAt,
      event.type,
      event.source,
      event.actorName ?? "",
      event.actorId ?? "",
      event.description ?? "",
    ]
    return cols
      .map((col) => {
        const value = typeof col === "string" ? col : JSON.stringify(col ?? "")
        if (/[",\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      .join(",")
  })
  return [header, ...rows].join("\n")
}

const toJsonl = (events: Awaited<ReturnType<typeof listSecurityAuditEvents>>) =>
  events.map((event) => JSON.stringify(event)).join("\n")

type AuditDeps = {
  verifyAccess?: typeof verifyControlPanelGuildAccess
  fetchEvents?: typeof listSecurityAuditEvents
}

export const createSecurityAuditHandlers = (deps: AuditDeps = {}) => {
  const verifyAccess = deps.verifyAccess ?? verifyControlPanelGuildAccess
  const fetchEvents = deps.fetchEvents ?? listSecurityAuditEvents

  const getHandler = async (request: NextRequest) => {
    const guildId = request.nextUrl.searchParams.get("guildId")?.trim()
    const discordId = request.nextUrl.searchParams.get("discordId")?.trim()
    if (!guildId || !discordId) {
      return NextResponse.json({ error: "guild_and_discord_required" }, { status: 400 })
    }

    const access = await verifyAccess(request, discordId, guildId)
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: access.status })
    }

    if (!ensureSecurityAccess(access.tier)) {
      return NextResponse.json({ error: "plan_required" }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const from = parseDate(params.get("from"))
    const to = parseDate(params.get("to"))
    const actor = params.get("actor")?.trim() || null
    const limitParam = Number(params.get("limit") || "")
    const limit = Number.isFinite(limitParam) ? Math.max(25, Math.min(500, limitParam)) : 100
    const typeFilter = normalizeType(params.get("type"))
    const events = await fetchEvents(guildId, {
      limit,
      from,
      to,
      actor,
      type: typeFilter ?? undefined,
    })

    const format = (params.get("format") || "json").toLowerCase()
    if (format === "csv" || format === "jsonl") {
      const filename = `security-audit-${guildId}-${Date.now()}.${format === "csv" ? "csv" : "jsonl"}`
      const headers = new Headers()
      if (format === "csv") {
        headers.set("Content-Type", "text/csv; charset=utf-8")
        headers.set("Content-Disposition", `attachment; filename="${filename}"`)
        return new NextResponse(toCsv(events), { status: 200, headers })
      }
      headers.set("Content-Type", "application/x-ndjson; charset=utf-8")
      headers.set("Content-Disposition", `attachment; filename="${filename}"`)
      return new NextResponse(toJsonl(events), { status: 200, headers })
    }

    return NextResponse.json({ events })
  }

  return { GET: getHandler }
}

const defaultHandlers = createSecurityAuditHandlers()
export const GET = defaultHandlers.GET
