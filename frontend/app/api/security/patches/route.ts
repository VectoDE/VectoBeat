import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

type PatchWave = {
  title: string
  date: string
  cves: string[]
  notes: string[]
  status: string
  cveSummaries: Array<{ id: string; summary: string }>
}

const KEYWORDS = ["security", "cve", "patch", "webhook", "auth", "encryption", "hardening", "vuln", "zero-downtime"]

const isSecurityLine = (line: string) => {
  const lower = line.toLowerCase()
  return KEYWORDS.some((keyword) => lower.includes(keyword))
}

const extractCves = (line: string) => {
  const matches = line.match(/CVE-\d{4}-\d+/gi) || []
  return matches
}

const synthesizeCveSummary = (id: string, version: string, date: string, notes: string[]) => {
  const base = notes.length
    ? notes
        .map((note) => note.replace(/^[•\-]+\s*/, ""))
        .join("; ")
    : "Security hardening across authentication, webhook validation, and dependency risk."
  return `CVE ${id}: VectoBeat ${version} (${date}) — ${base}`
}

const parseChangelog = (content: string): PatchWave[] => {
  const sections = content.split(/^## /m).filter(Boolean)
  const patches: PatchWave[] = []

  sections.forEach((section) => {
    const [header, ...rest] = section.split("\n")
    const headerMatch = header.match(/^\[(.+?)\]\s*-\s*(.+)$/)
    if (!headerMatch) return
    const version = headerMatch[1].trim()
    const date = headerMatch[2].trim()
    const lines = rest.join("\n").split("\n").map((line) => line.trim()).filter(Boolean)
    const relevant = lines.filter((line) => line.startsWith("-") && isSecurityLine(line))
    if (!relevant.length) return
    let cves = Array.from(new Set(relevant.flatMap((line) => extractCves(line))))
    const notes = relevant.map((line) => line.replace(/^-+\s*/, "")).slice(0, 4)
    // If no CVE was explicitly listed, synthesize an internal ID so the entry is tracked.
    if (!cves.length) {
      const normalizedVersion = version.replace(/[^0-9a-z]+/gi, "-")
      cves = [`CVE-UNASSIGNED-${normalizedVersion}-${patches.length + 1}`]
    }
    const cveSummaries = cves.map((id) => ({
      id,
      summary: synthesizeCveSummary(id, version, date, notes),
    }))

    patches.push({
      title: `Release ${version}`,
      date,
      cves,
      notes,
      status: "Live",
      cveSummaries,
    })
  })

  return patches
}

export async function GET() {
  try {
    const changelogPath = path.join(process.cwd(), "..", "CHANGELOG.md")
    const content = await fs.readFile(changelogPath, "utf8")
    const patches = parseChangelog(content)
    const totalCves = patches.reduce((sum, patch) => sum + patch.cves.length, 0)
    const latestDate = patches[0]?.date ?? null
    return NextResponse.json({ patches, totalCves, latestDate })
  } catch (error) {
    console.error("[VectoBeat] Failed to load security patches:", error)
    return NextResponse.json({ patches: [], totalCves: 0, latestDate: null })
  }
}
