import fs from "fs"
import path from "path"

const GITHUB_REPO = process.env.GITHUB_CHANGELOG_REPO || "VectoDE/VectoBeat"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  published_at: string | null
  body: string | null
  prerelease: boolean
  draft: boolean
  html_url: string
}

export type ChangelogEntry = {
  id: number
  version: string
  title: string
  publishedAt: string | null
  type: "major" | "minor" | "patch"
  url: string
  body: string
  highlights: string[]
  changes: Array<{ type: "feature" | "improvement" | "bugfix"; text: string }>
}

const classifyReleaseType = (tag: string): "major" | "minor" | "patch" => {
  const normalized = tag.replace(/^v/i, "").split("-")[0]
  const [majorRaw = "0", minorRaw = "0", patchRaw = "0"] = normalized.split(".")
  const major = Number.parseInt(majorRaw, 10)
  const minor = Number.parseInt(minorRaw, 10)
  const patch = Number.parseInt(patchRaw, 10)
  if (Number.isFinite(major) && major > 0 && minor === 0 && patch === 0) {
    return "major"
  }
  if (Number.isFinite(minor) && minor > 0 && (!Number.isFinite(patch) || patch === 0)) {
    return "minor"
  }
  return "patch"
}

const classifyChangeType = (text: string): "feature" | "improvement" | "bugfix" => {
  const lower = text.toLowerCase()
  if (lower.includes("fix") || lower.includes("bug")) return "bugfix"
  if (lower.includes("improv") || lower.includes("update") || lower.includes("upgrade")) return "improvement"
  return "feature"
}

const parseReleaseBody = (body: string | null) => {
  const lines = body?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? []
  const highlights: string[] = []
  const changeLines: string[] = []
  let inHighlightSection = false

  lines.forEach((line) => {
    const headingMatch = line.match(/^#{1,6}\s*(.+)$/)
    if (headingMatch) {
      inHighlightSection = headingMatch[1].toLowerCase().includes("highlight")
      return
    }

    if (/^highlights:?$/i.test(line)) {
      inHighlightSection = true
      return
    }

    const bulletMatch = line.match(/^[-*+]\s+(.*)/)
    if (bulletMatch) {
      const content = bulletMatch[1].trim()
      if (!content) return
      if (inHighlightSection) {
        highlights.push(content)
      } else {
        changeLines.push(content)
      }
      return
    }

    if (inHighlightSection && line) {
      highlights.push(line)
      return
    }

    if (!highlights.length) {
      const sanitized = line.replace(/^#{1,6}\s*/, "")
      if (sanitized) {
        highlights.push(sanitized)
      }
    }
  })

  if (!highlights.length && lines.length) {
    const fallback = lines[0].replace(/^#{1,6}\s*/, "")
    if (fallback) {
      highlights.push(fallback)
    }
  }

  return {
    highlights,
    changes: changeLines.map((text) => ({
      type: classifyChangeType(text),
      text,
    })),
  }
}

export const fetchChangelog = async (): Promise<ChangelogEntry[]> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      },
      next: {
        revalidate: 60 * 30,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch releases: ${response.status}`)
    }

    const releases = (await response.json()) as GitHubRelease[]
    const parsed = releases
      .filter((release) => !release.draft)
      .map((release) => {
        const { highlights, changes } = parseReleaseBody(release.body)
        return {
          id: release.id,
          version: release.tag_name,
          title: release.name || release.tag_name,
          publishedAt: release.published_at,
          type: classifyReleaseType(release.tag_name),
          url: release.html_url,
          body: release.body ?? "",
          highlights,
          changes,
        }
      })

    if (parsed.length) {
      return parsed
    }
  } catch (error) {
    console.error("[VectoBeat] Failed to fetch GitHub changelog, falling back to local file:", error)
  }

  return readLocalChangelog()
}

export const summarizeReleases = (releases: ChangelogEntry[]) => {
  const major = releases.filter((r) => r.type === "major").length
  const minor = releases.filter((r) => r.type === "minor").length
  const patch = releases.filter((r) => r.type === "patch").length

  return [
    { label: "Total Releases", value: releases.length.toString() },
    { label: "Major Releases", value: major.toString() },
    { label: "Minor Releases", value: minor.toString() },
    { label: "Patch Releases", value: patch.toString() },
    { label: "Latest Release", value: releases[0]?.version ?? "No release yet" },
  ]
}

const readLocalChangelog = (): ChangelogEntry[] => {
  const filePath = path.join(process.cwd(), "CHANGELOG.md")
  const content = fs.readFileSync(filePath, "utf8")
  const headerRegex = /^## \[(.+?)\] - ([^\n]+)$/gm
  const entries: ChangelogEntry[] = []
  let match: RegExpExecArray | null
  const positions: Array<{ version: string; date: string; start: number; end: number }> = []

  while ((match = headerRegex.exec(content)) !== null) {
    const version = match[1]
    const date = match[2]
    const start = headerRegex.lastIndex
    positions.push({ version, date, start, end: content.length })
    if (positions.length > 1) {
      positions[positions.length - 2].end = match.index
    }
  }

  positions.forEach((pos, index) => {
    const body = content.slice(pos.start, pos.end).trim()
    const { highlights, changes } = parseReleaseBody(body)
    const sanitizedVersion = pos.version.trim()
    const publishedAt = new Date(pos.date).toString() === "Invalid Date" ? null : pos.date
    entries.push({
      id: index + 1,
      version: sanitizedVersion,
      title: sanitizedVersion,
      publishedAt,
      type: classifyReleaseType(sanitizedVersion),
      url: `https://github.com/${GITHUB_REPO}/releases/tag/${sanitizedVersion}`,
      body,
      highlights,
      changes,
    })
  })

  return entries
}
