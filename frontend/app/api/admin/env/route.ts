import { NextRequest, NextResponse } from "next/server"
import { requireAuth, verifyRequestForUser } from "@/lib/auth"
import { getUserRole } from "@/lib/db"
import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"

const getEnvPath = (target: "frontend" | "bot") =>
  target === "bot" ? path.resolve(process.cwd(), "../bot/.env") : path.resolve(process.cwd(), ".env")

const readEnvFile = async (target: "frontend" | "bot") => {
  const envPath = getEnvPath(target)
  try {
    const raw = await fs.readFile(envPath, "utf8")
    return dotenv.parse(raw)
  } catch {
    return {}
  }
}

const writeEnvFile = async (target: "frontend" | "bot", entries: Record<string, string>) => {
  const envPath = getEnvPath(target)
  const lines = Object.keys(entries)
    .sort()
    .map((key) => `${key}=${entries[key] ?? ""}`)
  await fs.writeFile(envPath, lines.join("\n"), "utf8")
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request)
  if (!result.ok) return result.response
  const { discordId } = result
  const targetParam = request.nextUrl.searchParams.get("target")
  const target = targetParam === "bot" ? "bot" : "frontend"

  const role = await getUserRole(discordId)
  if (!["admin", "operator"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const fileEnv = await readEnvFile(target)

  const SENSITIVE_PATTERNS = [
    /SECRET/i, /TOKEN/i, /PASSWORD/i, /KEY/i, /CREDENTIAL/i,
    /DATABASE_URL/i, /REDIS_URL/i, /SMTP_PASS/i, /PRIVATE/i,
  ]
  const isSensitive = (key: string) => SENSITIVE_PATTERNS.some((p) => p.test(key))
  const redact = (key: string, value: string) => {
    if (!isSensitive(key)) return value
    if (!value) return ""
    return value.length > 4 ? `${"*".repeat(value.length - 4)}${value.slice(-4)}` : "****"
  }

  const entries = Object.entries(fileEnv).map(([key, value]) => ({
    key,
    value: redact(key, value),
    configured: Boolean(value),
  }))
  return NextResponse.json({ entries, source: { file: getEnvPath(target), target } })
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const discordId = typeof body?.discordId === "string" ? body.discordId : null
    const target = body?.target === "bot" ? "bot" : "frontend"
    const updates = Array.isArray(body?.updates) ? (body.updates as Array<{ key?: string; value?: string }>) : []

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
    if (!updates.length) {
      return NextResponse.json({ error: "no_updates" }, { status: 400 })
    }

    const current = await readEnvFile(target)
    const next = { ...current }
    for (const entry of updates) {
      if (!entry.key) continue
      next[entry.key] = entry.value ?? ""
    }
    await writeEnvFile(target, next)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[VectoBeat] Failed to update env:", error)
    return NextResponse.json({ error: "unable_to_update_env" }, { status: 500 })
  }
}
