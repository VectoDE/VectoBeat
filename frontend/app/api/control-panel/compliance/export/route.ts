"use server"

import { NextResponse, type NextRequest } from "next/server"
import { listQueueActionsForExport, listModerationEventsForExport, listBillingEntriesForExport } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureComplianceAccess = (tier: MembershipTier) => {
  const plan = getPlanCapabilities(tier)
  return plan.features.webhookExports || plan.features.apiTokens
}

const toJsonl = (records: Record<string, any>[]) =>
  records.map((record) => JSON.stringify(record)).join("\n")

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return ""
  const str = typeof value === "string" ? value : JSON.stringify(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const toCsv = (records: Record<string, any>[]) => {
  if (records.length === 0) {
    return ""
  }
  const columns = Object.keys(records[0])
  const header = columns.join(",")
  const rows = records.map((record) => columns.map((column) => escapeCsv(record[column])).join(","))
  return [header, ...rows].join("\n")
}

const buildResponse = (content: string, format: "jsonl" | "csv", filename: string) => {
  const headers = new Headers()
  headers.set(
    "Content-Type",
    format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/csv; charset=utf-8",
  )
  headers.set("Content-Disposition", `attachment; filename="${filename}"`)
  return new NextResponse(content, { status: 200, headers })
}

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get("guildId") || ""
  const discordId = request.nextUrl.searchParams.get("discordId") || ""
  const type = (request.nextUrl.searchParams.get("type") || "queue").toLowerCase() as
    | "queue"
    | "moderation"
    | "billing"
  const format = (request.nextUrl.searchParams.get("format") || "jsonl").toLowerCase() as "jsonl" | "csv"
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "guild_required" }, { status: 400 })
  }
  if (!["queue", "moderation", "billing"].includes(type)) {
    return NextResponse.json({ error: "unknown_type" }, { status: 400 })
  }
  if (!["jsonl", "csv"].includes(format)) {
    return NextResponse.json({ error: "unknown_format" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  if (!ensureComplianceAccess(access.tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  let records: Record<string, any>[] = []
  if (type === "queue") {
    records = await listQueueActionsForExport(guildId)
  } else if (type === "moderation") {
    records = await listModerationEventsForExport(guildId)
  } else {
    records = await listBillingEntriesForExport(guildId)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filename = `${type}-export-${timestamp}.${format}`
  const content = format === "jsonl" ? toJsonl(records) : toCsv(records)
  return buildResponse(content, format, filename)
}
