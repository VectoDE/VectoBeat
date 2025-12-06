import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"

const run = promisify(exec)

type SeverityCounts = {
  critical: number
  high: number
  moderate: number
  low: number
  info?: number
}

const weight = { critical: 5, high: 4, moderate: 2, low: 1 }

const score = (counts: SeverityCounts) =>
  counts.critical * weight.critical + counts.high * weight.high + counts.moderate * weight.moderate + counts.low * weight.low

const npmAudit = async (): Promise<{ counts: SeverityCounts; raw?: any; ok: boolean; error?: string }> => {
  const cwd = path.resolve(process.cwd())
  try {
    const { stdout } = await run("npm audit --json --production", { cwd, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 })
    const parsed = JSON.parse(stdout || "{}")
    const vulnerabilities = parsed.vulnerabilities || {}
    const counts: SeverityCounts = {
      critical: vulnerabilities.critical?.length || vulnerabilities.critical || 0,
      high: vulnerabilities.high?.length || vulnerabilities.high || 0,
      moderate: vulnerabilities.moderate?.length || vulnerabilities.moderate || 0,
      low: vulnerabilities.low?.length || vulnerabilities.low || 0,
    }
    return { counts, raw: parsed, ok: true }
  } catch (error) {
    return { counts: { critical: 0, high: 0, moderate: 0, low: 0 }, ok: false, error: (error as Error).message }
  }
}

const pipAudit = async (): Promise<{ counts: SeverityCounts; raw?: any; ok: boolean; error?: string }> => {
  const cwd = path.resolve(process.cwd(), "..", "bot")
  try {
    const { stdout } = await run("pip-audit -f json", { cwd, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 })
    const parsed = JSON.parse(stdout || "[]")
    const counts: SeverityCounts = { critical: 0, high: 0, moderate: 0, low: 0 }
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        const severity = (item?.vulns?.[0]?.severity || "").toLowerCase()
        if (severity in counts) {
          // @ts-ignore
          counts[severity] += 1
        } else {
          counts.moderate += 1
        }
      })
    }
    return { counts, raw: parsed, ok: true }
  } catch (error) {
    return { counts: { critical: 0, high: 0, moderate: 0, low: 0 }, ok: false, error: (error as Error).message }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const discordId = typeof body?.discordId === "string" ? body.discordId : null

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

  const [npmResult, pipResult] = await Promise.all([npmAudit(), pipAudit()])
  const totalScore = score(npmResult.counts) + score(pipResult.counts)
  const nextSweepAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    riskScore: totalScore,
    npm: npmResult,
    python: pipResult,
    nextSweepAt,
  })
}
