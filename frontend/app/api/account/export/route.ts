import { type NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import path from "path"
import fs from "fs/promises"
import {
  getUserContact,
  getUserPreferences,
  getUserNotifications,
  getUserPrivacy,
  getUserSecurity,
  getUserSubscriptions,
} from "@/lib/db"
import { verifyRequestForUser } from "@/lib/auth"

const PDF_CHAR_REPLACEMENTS: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "‚": ",",
  "“": '"',
  "”": '"',
  "„": '"',
  "—": "-",
  "–": "-",
  "-": "-",
  "·": "-",
  "…": "...",
  "->": "->",
  "←": "<-",
  "↔": "<->",
  "↗": "->",
  "↘": "->",
  "™": "TM",
  "®": "(R)",
  "©": "(C)",
  " ": " ",
  " ": " ",
}

const sanitizePdfText = (value: unknown) => {
  if (value === null || value === undefined) {
    return ""
  }
  const input = String(value)
  let output = ""
  for (const char of input) {
    const replacement = PDF_CHAR_REPLACEMENTS[char]
    if (replacement) {
      output += replacement
      continue
    }
    const code = char.charCodeAt(0)
    if (code === 0 || code > 255) {
      output += "?"
      continue
    }
    output += char
  }
  return output
}

const loadLogo = async () => {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png")
    return await fs.readFile(logoPath)
  } catch (error) {
    console.warn("[VectoBeat] Unable to load logo for PDF export:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [contact, preferences, notifications, privacy, security, subscriptions, logoBuffer] = await Promise.all([
    getUserContact(discordId),
    getUserPreferences(discordId),
    getUserNotifications(discordId),
    getUserPrivacy(discordId),
    getUserSecurity(discordId),
    getUserSubscriptions(discordId),
    loadLogo(),
  ])

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const pageSize = { width: 595.28, height: 841.89 } // A4

  let page = doc.addPage([pageSize.width, pageSize.height])
  const margin = 48
  let cursorY = pageSize.height - margin

  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const { size = 12, bold = false, color = [0, 0, 0] as [number, number, number] } = options
    const lines = sanitizePdfText(text).split("\n")
    for (const line of lines) {
      if (cursorY < margin) {
        page = doc.addPage([pageSize.width, pageSize.height])
        cursorY = pageSize.height - margin
      }
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size,
        font: bold ? boldFont : font,
        color: rgb(color[0], color[1], color[2]),
      })
      cursorY -= size + 4
    }
    cursorY -= 4
  }

  if (logoBuffer) {
    try {
      const logoImage = await doc.embedPng(logoBuffer)
      const logoWidth = 120
      const logoHeight = (logoImage.height / logoImage.width) * logoWidth
      page.drawImage(logoImage, {
        x: pageSize.width - logoWidth - margin,
        y: cursorY - logoHeight + 24,
        width: logoWidth,
        height: logoHeight,
      })
    } catch (error) {
      console.warn("[VectoBeat] Failed to embed logo in PDF:", error)
    }
  }

  drawText("VectoBeat Account Export", { size: 20, bold: true, color: [0.09, 0.32, 0.55] })
  drawText(`Discord ID: ${discordId}`, { size: 12 })
  cursorY -= 8

  const addSection = (title: string, entries: Array<[string, string | number | boolean | null | undefined]>) => {
    drawText(title, { size: 14, bold: true, color: [0.09, 0.32, 0.55] })
    entries.forEach(([key, value]) => {
      drawText(`${key}: ${value ?? "Not set"}`, { size: 11 })
    })
    cursorY -= 8
  }

  addSection("Contact", [
    ["Email", contact.email],
    ["Phone", contact.phone],
  ])

  addSection("Preferences", [
    ["Preferred Language", preferences.preferredLanguage],
    ["Email Updates", preferences.emailUpdates],
    ["Product Updates", preferences.productUpdates],
    ["Weekly Digest", preferences.weeklyDigest],
    ["SMS Alerts", preferences.smsAlerts],
  ])

  addSection("Notifications", [
    ["Maintenance Alerts", notifications.maintenanceAlerts],
    ["Downtime Alerts", notifications.downtimeAlerts],
    ["Release Notes", notifications.releaseNotes],
    ["Security Notifications", notifications.securityNotifications],
    ["Beta Program", notifications.betaProgram],
    ["Community Events", notifications.communityEvents],
  ])

  addSection("Privacy", [
    ["Public Profile", privacy.profilePublic],
    ["Search Visibility", privacy.searchVisibility],
    ["Analytics Opt-In", privacy.analyticsOptIn],
    ["Data Sharing", privacy.dataSharing],
  ])

  addSection("Security", [
    ["Two-Factor Enabled", security.twoFactorEnabled],
    ["Login Alerts", security.loginAlerts],
    ["Backup Codes Remaining", security.backupCodesRemaining],
    ["Active Sessions", security.activeSessions],
  ])

  drawText("Subscriptions", { size: 14, bold: true, color: [0.09, 0.32, 0.55] })
  if (!subscriptions.length) {
    drawText("No active subscriptions", { size: 11 })
  } else {
    subscriptions.forEach((sub) => {
      drawText(`${sub.tier.toUpperCase()} - ${sub.name}`, { size: 12, bold: true })
      drawText(`Status: ${sub.status} | Monthly: $${sub.pricePerMonth.toFixed(2)}`, { size: 11 })
      drawText(
        `Period: ${new Date(sub.currentPeriodStart).toLocaleDateString()} -> ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`,
        { size: 11 },
      )
      cursorY -= 6
    })
  }

  const pdfBytes = await doc.save()
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vectobeat-data-${discordId}.pdf"`,
    },
  })
}
