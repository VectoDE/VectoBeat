import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
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
  const discordId = request.nextUrl.searchParams.get("discordId")
  const targetParam = request.nextUrl.searchParams.get("target")
  const target = targetParam === "bot" ? "bot" : "frontend"
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

  const fileEnv = await readEnvFile(target)
  const merged: Record<string, string> = { ...fileEnv }
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      merged[key] = value
    }
  }

  const entries = Object.entries(merged).map(([key, value]) => ({ key, value }))
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
