import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib"
import fs from "fs/promises"
import path from "path"

// --- Constants & Config ---

const MARGIN = 50
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

// Brand Colors (Refined from CSS OKLCH)
// Primary: oklch(0.62 0.25 39) -> sRGB approx R=0.96, G=0.38, B=0.17 (#F5612B)
const COLOR_PRIMARY = rgb(0.96, 0.38, 0.17)
// Secondary: Dark Grey (Neutral) instead of Purple
const COLOR_SECONDARY = rgb(0.2, 0.2, 0.2)
const COLOR_TEXT = rgb(0.1, 0.1, 0.1)
const COLOR_TEXT_LIGHT = rgb(0.4, 0.4, 0.4)
const COLOR_BORDER = rgb(0.85, 0.85, 0.85)
const COLOR_HEADER_BG = rgb(0.97, 0.97, 0.97)
const COLOR_TABLE_STRIPE = rgb(0.98, 0.98, 1.0)

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
    if (code >= 32 && code <= 255) {
      output += char
    } else {
      output += "?"
    }
  }
  return output
}

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-"
  try {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "-"
  }
}

export class PdfGenerator {
  doc: PDFDocument
  font!: PDFFont
  boldFont!: PDFFont
  logoImage?: PDFImage
  page!: PDFPage
  cursorY: number
  logoPath?: string

  constructor(doc: PDFDocument, logoPath?: string) {
    this.doc = doc
    this.cursorY = PAGE_HEIGHT - MARGIN
    this.logoPath = logoPath
  }

  async init() {
    this.font = await this.doc.embedFont(StandardFonts.Helvetica)
    this.boldFont = await this.doc.embedFont(StandardFonts.HelveticaBold)
    
    if (this.logoPath) {
      try {
        const logoBytes = await fs.readFile(this.logoPath)
        // Determine type based on extension or try both
        if (this.logoPath.endsWith('.png')) {
             this.logoImage = await this.doc.embedPng(logoBytes)
        } else if (this.logoPath.endsWith('.jpg') || this.logoPath.endsWith('.jpeg')) {
            this.logoImage = await this.doc.embedJpg(logoBytes)
        }
      } catch (e) {
        console.warn("Failed to load logo image", e)
      }
    }

    this.addPage()
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.cursorY = PAGE_HEIGHT - MARGIN - 40 // More space for header
    this.drawHeader()
    this.drawFooter()
  }

  checkPageBreak(heightNeeded: number) {
    if (this.cursorY - heightNeeded < MARGIN + 40) { // Footer margin
      this.addPage()
    }
  }

  drawHeader() {
    const headerY = PAGE_HEIGHT - MARGIN + 10

    // Draw Logo if available
    let textX = MARGIN
    if (this.logoImage) {
        const logoSize = 32
        this.page.drawImage(this.logoImage, {
            x: MARGIN,
            y: headerY - 7, // Visual alignment correction
            width: logoSize,
            height: logoSize,
        })
        textX += logoSize + 8
    }

    // Branding Text
    this.page.drawText("VectoBeat", {
        x: textX,
        y: headerY,
        size: 18,
        font: this.boldFont,
        color: COLOR_PRIMARY,
    })

    // Right side header info
    this.page.drawText("DATA EXPORT", {
        x: PAGE_WIDTH - MARGIN - 120,
        y: headerY,
        size: 18,
        font: this.boldFont,
        color: COLOR_SECONDARY,
    })

    this.page.drawText(`Generated: ${formatDate(new Date())}`, {
        x: PAGE_WIDTH - MARGIN - 120,
        y: headerY - 15,
        size: 8,
        font: this.font,
        color: COLOR_TEXT_LIGHT,
    })

    // Divider
    this.page.drawLine({
        start: { x: MARGIN, y: headerY - 30 },
        end: { x: PAGE_WIDTH - MARGIN, y: headerY - 30 },
        thickness: 2,
        color: COLOR_PRIMARY,
    })
  }

  drawFooter() {
    const footerY = MARGIN - 10

    // Divider
    this.page.drawLine({
        start: { x: MARGIN, y: footerY + 20 },
        end: { x: PAGE_WIDTH - MARGIN, y: footerY + 20 },
        thickness: 0.5,
        color: COLOR_BORDER,
    })

    // Left: Branding
    this.page.drawText("Powered by UplyTech | VectoBeat", {
        x: MARGIN,
        y: footerY,
        size: 8,
        font: this.boldFont,
        color: COLOR_SECONDARY,
    })

    // Center: Legal Disclaimer
    const legalText = "Confidential. For personal use only. Contains sensitive data."
    const legalWidth = this.font.widthOfTextAtSize(legalText, 7)
    this.page.drawText(legalText, {
        x: (PAGE_WIDTH - legalWidth) / 2,
        y: footerY,
        size: 7,
        font: this.font,
        color: COLOR_TEXT_LIGHT,
    })

    // Right: Page Number (Placeholder, updated at end usually, but simplistic here)
    const pageCount = this.doc.getPageCount()
    // Note: This is tricky because we don't know total pages yet during stream. 
    // We will revisit pages at the end to fill numbers if we want "Page X of Y".
    // For now, just "Page X"
    this.page.drawText(`Page ${pageCount}`, {
        x: PAGE_WIDTH - MARGIN - 30,
        y: footerY,
        size: 8,
        font: this.font,
        color: COLOR_TEXT_LIGHT,
    })
  }

  drawSectionTitle(title: string) {
    this.checkPageBreak(50)
    this.cursorY -= 15
    
    // Colored Box for Section
    this.page.drawRectangle({
        x: MARGIN - 5,
        y: this.cursorY - 5,
        width: CONTENT_WIDTH + 10,
        height: 25,
        color: COLOR_SECONDARY,
    })

    this.page.drawText(title.toUpperCase(), {
      x: MARGIN,
      y: this.cursorY + 2,
      size: 12,
      font: this.boldFont,
      color: rgb(1, 1, 1), // White text
    })
    
    this.cursorY -= 25
  }

  drawKeyValue(key: string, value: string | null | undefined) {
    this.checkPageBreak(18)
    const label = sanitizePdfText(key)
    const val = sanitizePdfText(value || "-")

    this.page.drawText(label + ":", {
      x: MARGIN,
      y: this.cursorY,
      size: 10,
      font: this.boldFont,
      color: COLOR_TEXT_LIGHT,
    })

    this.page.drawText(val, {
      x: MARGIN + 140,
      y: this.cursorY,
      size: 10,
      font: this.font,
      color: COLOR_TEXT,
    })

    this.cursorY -= 18
  }

  drawTable(headers: string[], rows: string[][], colWidths: number[]) {
    const rowHeight = 24
    const fontSize = 9
    
    this.checkPageBreak(rowHeight * 2)

    // Draw Header
    let currentX = MARGIN
    
    // Header Background
    this.page.drawRectangle({
      x: MARGIN,
      y: this.cursorY - 8,
      width: CONTENT_WIDTH,
      height: rowHeight,
      color: COLOR_SECONDARY,
    })

    headers.forEach((header, i) => {
      this.page.drawText(sanitizePdfText(header), {
        x: currentX + 5,
        y: this.cursorY,
        size: fontSize,
        font: this.boldFont,
        color: rgb(1, 1, 1),
      })
      currentX += colWidths[i]
    })
    
    this.cursorY -= rowHeight

    // Draw Rows
    rows.forEach((row, rowIndex) => {
      this.checkPageBreak(rowHeight)
      
      currentX = MARGIN
      
      // Zebra Striping
      if (rowIndex % 2 === 0) {
          this.page.drawRectangle({
              x: MARGIN,
              y: this.cursorY - 8,
              width: CONTENT_WIDTH,
              height: rowHeight,
              color: COLOR_TABLE_STRIPE,
          })
      }

      row.forEach((cell, i) => {
        let text = sanitizePdfText(cell)
        // Truncate if too long
        const maxWidth = colWidths[i] - 10
        if (this.font.widthOfTextAtSize(text, fontSize) > maxWidth) {
          while (text.length > 0 && this.font.widthOfTextAtSize(text + "...", fontSize) > maxWidth) {
            text = text.slice(0, -1)
          }
          text += "..."
        }

        this.page.drawText(text, {
          x: currentX + 5,
          y: this.cursorY,
          size: fontSize,
          font: this.font,
          color: COLOR_TEXT,
        })
        currentX += colWidths[i]
      })

      this.cursorY -= rowHeight
    })

    this.cursorY -= 15 // Space after table
  }

  // Helper to add legal text page
  addLegalPage() {
      this.addPage()
      this.drawSectionTitle("Legal Information & Data Privacy")
      
      const lines = [
          "This document contains a complete export of your personal data stored by VectoBeat, operated by UplyTech.",
          "",
          "Data Controller:",
          "UplyTech",
          "privacy@uplytech.de",
          "",
          "Purpose of Processing:",
          "Your data is processed to provide the VectoBeat service, including music streaming, bot management,",
          "and community features. This export is provided in compliance with GDPR Article 15 (Right of Access).",
          "",
          "Data Retention:",
          "We retain your data only as long as necessary to provide our services or as required by law.",
          "You have the right to request rectification or deletion of this data.",
          "",
          "Security:",
          "This document contains sensitive personal information (PII). Please store it securely.",
      ]

      let y = this.cursorY
      for (const line of lines) {
          this.page.drawText(line, {
              x: MARGIN,
              y: y,
              size: 10,
              font: line.includes(":") ? this.boldFont : this.font,
              color: COLOR_TEXT,
          })
          y -= 15
      }
      this.cursorY = y
  }
}
