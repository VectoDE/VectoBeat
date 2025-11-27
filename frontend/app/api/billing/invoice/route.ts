import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb, type Color } from "pdf-lib"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { readFile } from "fs/promises"
import { join } from "path"

const COMPANY = {
  name: "VectoBeat / VectoDE",
  line1: "c/o UplyTech",
  line2: "Breitenburger Straße 15",
  city: "25524 Itzehoe",
  country: "Germany",
  email: "billing@uplytech.de",
  phone: "+49 172 6166860",
  vatId: "DE123456789",
}

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)

const stripIdentifierPrefix = (value?: string | null) => {
  if (!value) return null
  return value.replace(/^[a-z]+_test_/i, "").replace(/^[a-z]+_/i, "")
}

const retrieveFromCheckout = async (sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "customer_details.address"],
  })
  if (!session) return null
  const sessionSubscription = (typeof session.subscription === "object" ? session.subscription : null) as any
  const periodEnd =
    typeof sessionSubscription?.current_period_end === "number"
      ? new Date(sessionSubscription.current_period_end * 1000).toISOString()
      : new Date().toISOString()
  return {
    invoiceNumber: session.id,
    issueDate: new Date().toISOString(),
    dueDate: periodEnd,
    customerName: session.customer_details?.name || "VectoBeat Subscriber",
    customerEmail: session.customer_details?.email || "",
    customerAddress: session.customer_details?.address,
    currency: session.currency || "eur",
    lineItems:
      session.line_items?.data.map((item) => ({
        description:
          item.description ||
          (typeof item.price?.product === "object" && item.price?.product
            ? (item.price.product as Stripe.Product).name
            : null) ||
          "Subscription",
        quantity: item.quantity || 1,
        unitAmount: item.price?.unit_amount ?? item.amount_subtotal ?? 0,
        totalAmount: item.amount_total ?? (item.price?.unit_amount ?? 0) * (item.quantity || 1),
      })) ?? [],
    subtotal: (session.amount_subtotal as number) ?? session.amount_total ?? 0,
    taxAmount: (session.total_details?.amount_tax as number) ?? 0,
    total: session.amount_total ?? 0,
    paymentStatus: session.payment_status ?? null,
    customerId:
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id ?? session.customer_details?.email ?? "",
  }
}

const retrieveFromSubscription = async (subscriptionId: string) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice", "latest_invoice.lines", "customer"],
  })
  if (!subscription) return null
  const invoice = subscription.latest_invoice as Stripe.Invoice
  const customer = (subscription.customer as Stripe.Customer) ?? undefined
  const lines = invoice?.lines?.data ?? []
  return {
    invoiceNumber: invoice?.id || subscription.id,
    issueDate: invoice?.created ? new Date(invoice.created * 1000).toISOString() : new Date().toISOString(),
    dueDate: invoice?.due_date ? new Date(invoice.due_date * 1000).toISOString() : new Date().toISOString(),
    customerName: customer?.name || invoice?.customer_name || "VectoBeat Subscriber",
    customerEmail: customer?.email || invoice?.customer_email || "",
    customerAddress: customer?.address || invoice?.customer_address,
    currency: invoice?.currency || subscription.currency || "eur",
    lineItems: lines.map((item: any) => {
      const planNickname =
        typeof item?.plan?.nickname === "string" ? item.plan.nickname : undefined
      const amountSubtotal = typeof item?.amount_subtotal === "number" ? item.amount_subtotal : null
      const amountExTax = typeof item?.amount_excluding_tax === "number" ? item.amount_excluding_tax : null
      const unitAmount = typeof item?.price?.unit_amount === "number" ? item.price.unit_amount : undefined
      return {
        description: item.description || planNickname || "Subscription",
        quantity: item.quantity || 1,
        unitAmount: unitAmount ?? amountSubtotal ?? 0,
        totalAmount: item.amount ?? amountExTax ?? 0,
      }
    }),
    subtotal: typeof (invoice as any)?.amount_subtotal === "number" ? (invoice as any).amount_subtotal : invoice?.amount_due ?? 0,
    taxAmount: typeof (invoice as any)?.amount_tax === "number" ? (invoice as any).amount_tax : 0,
    total: invoice?.amount_paid ?? invoice?.amount_due ?? 0,
    paymentStatus: invoice?.status ?? subscription.status ?? null,
    customerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : ((subscription.customer as Stripe.Customer | null)?.id ?? invoice?.customer_email ?? ""),
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get("sessionId")
    const subscriptionId = url.searchParams.get("subscriptionId")
    if (!sessionId && !subscriptionId) {
      return NextResponse.json({ error: "sessionId or subscriptionId is required" }, { status: 400 })
    }

    const invoiceData = sessionId ? await retrieveFromCheckout(sessionId) : await retrieveFromSubscription(subscriptionId!)
    if (!invoiceData) {
      return NextResponse.json({ error: "Unable to load invoice data." }, { status: 404 })
    }

    const {
      invoiceNumber,
      issueDate,
      dueDate,
      customerName,
      customerEmail,
      customerAddress,
      currency,
      lineItems,
      subtotal,
      taxAmount,
      total,
      paymentStatus,
      customerId,
    } = invoiceData

    const displayInvoiceNumber = stripIdentifierPrefix(invoiceNumber) || invoiceNumber
    const displayCustomerId = stripIdentifierPrefix(customerId) || customerId

    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const baseFont = await doc.embedFont(StandardFonts.Helvetica)
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()

    let logoImage: Awaited<ReturnType<typeof doc.embedPng>> | null = null
    try {
      const logoBuffer = await readFile(join(process.cwd(), "public", "logo.png"))
      logoImage = await doc.embedPng(logoBuffer)
    } catch (error) {
      console.warn("[VectoBeat] Could not embed invoice logo:", error)
    }

    const palette: Record<string, Color> = {
      background: rgb(0.97, 0.97, 0.99),
      header: rgb(0.06, 0.08, 0.13),
      accent: rgb(0.95, 0.52, 0.2),
      secondaryAccent: rgb(0.42, 0.5, 0.96),
      text: rgb(0.13, 0.15, 0.2),
      muted: rgb(0.45, 0.47, 0.53),
      border: rgb(0.82, 0.85, 0.9),
      rowAlt: rgb(0.99, 0.99, 1),
    }

    const getFont = (variant: "regular" | "bold") => (variant === "bold" ? boldFont : baseFont)

    const drawText = (
      text: string,
      x: number,
      y: number,
      opts: { size?: number; color?: Color; font?: "regular" | "bold" } = {},
    ) => {
      const { size = 11, color = palette.text, font = "regular" } = opts
      page.drawText(text, {
        x,
        y,
        size,
        font: getFont(font),
        color,
      })
    }

    const wrapText = (text: string, maxWidth: number, size: number, font: "regular" | "bold" = "regular") => {
      const activeFont = getFont(font)
      const lines: string[] = []
      const paragraphs = String(text || "").split(/\r?\n/)

      paragraphs.forEach((paragraph, index) => {
        const words = paragraph.trim().length ? paragraph.trim().split(/\s+/) : []
        let current = ""
        if (words.length === 0) {
          lines.push("")
        }
        words.forEach((word) => {
          const tentative = current ? `${current} ${word}` : word
          const width = activeFont.widthOfTextAtSize(tentative, size)
          if (width > maxWidth && current) {
            lines.push(current)
            current = word
          } else {
            current = tentative
          }
        })
        if (current) {
          lines.push(current)
        }
        if (index < paragraphs.length - 1) {
          lines.push("")
        }
      })

      return lines.length ? lines : [""]
    }

    const drawWrappedText = (
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      size: number,
      font: "regular" | "bold" = "regular",
      lineHeight = 14,
    ) => {
      const lines = wrapText(text, maxWidth, size, font)
      lines.forEach((line, index) => {
        drawText(line, x, y - index * lineHeight, { size, font })
      })
      return lines.length * lineHeight
    }

    const marginX = 48

    // Header background
    const headerHeight = 140
    page.drawRectangle({ x: 0, y: pageHeight - headerHeight, width: pageWidth, height: headerHeight, color: palette.header })
    page.drawRectangle({ x: 0, y: pageHeight - headerHeight + 18, width: pageWidth, height: 2, color: palette.accent })

    if (logoImage) {
      const scaled = logoImage.scale(0.18)
      page.drawImage(logoImage, {
        x: marginX,
        y: pageHeight - 40 - scaled.height,
        width: scaled.width,
        height: scaled.height,
      })
    }

    drawText("VectoBeat", marginX + (logoImage ? 70 : 0), pageHeight - 50, { size: 26, font: "bold", color: palette.accent })
    drawText("Enterprise Music Automation Suite", marginX + (logoImage ? 70 : 0), pageHeight - 70, {
      size: 11,
      color: rgb(0.8, 0.83, 0.9),
    })

    const invoiceLabelBoxWidth = 170
    page.drawRectangle({
      x: pageWidth - marginX - invoiceLabelBoxWidth,
      y: pageHeight - 84,
      width: invoiceLabelBoxWidth,
      height: 68,
      color: palette.accent,
    })
    drawText("Rechnung", pageWidth - marginX - invoiceLabelBoxWidth + 18, pageHeight - 40, {
      size: 16,
      font: "bold",
      color: palette.header,
    })
    drawText(`#${displayInvoiceNumber}`, pageWidth - marginX - invoiceLabelBoxWidth + 18, pageHeight - 62, {
      size: 10,
      color: palette.header,
    })

    // Address blocks
    const addressTop = pageHeight - headerHeight - 30
    const columnWidth = (pageWidth - marginX * 2 - 40) / 2

    drawText("Rechnungsadresse", marginX, addressTop, { font: "bold", size: 12 })
    const billingHeight = drawWrappedText(
      [COMPANY.name, COMPANY.line1, COMPANY.line2, COMPANY.city, COMPANY.country].filter(Boolean).join("\n"),
      marginX,
      addressTop - 18,
      columnWidth,
      11,
    )

    drawText("Lieferanschrift", marginX + columnWidth + 40, addressTop, { font: "bold", size: 12 })
    const customerAddressLines = [
      customerName,
      customerAddress?.line1,
      customerAddress?.line2,
      [customerAddress?.postal_code, customerAddress?.city].filter(Boolean).join(" "),
      customerAddress?.country,
      customerEmail,
    ].filter(Boolean) as string[]
    const shippingHeight = drawWrappedText(
      customerAddressLines.join("\n"),
      marginX + columnWidth + 40,
      addressTop - 18,
      columnWidth,
      11,
    )

    const addressBlockHeight = Math.max(billingHeight, shippingHeight) + 30

    // Summary chips
    const summaryTop = addressTop - addressBlockHeight
    drawText("Überblick", marginX, summaryTop, { font: "bold", size: 14 })
    const summaryCards = [
      { label: "Rechnungsdatum", value: new Date(issueDate).toLocaleDateString("de-DE") },
      { label: "Fälligkeitsdatum", value: new Date(dueDate).toLocaleDateString("de-DE") },
      { label: "Kundennummer", value: displayCustomerId || "—" },
      { label: "Status", value: paymentStatus ? paymentStatus.toUpperCase() : "OFFEN" },
    ]
    const cardWidth = (pageWidth - marginX * 2 - 30) / 4
    summaryCards.forEach((card, index) => {
      const x = marginX + index * (cardWidth + 10)
      page.drawRectangle({ x, y: summaryTop - 60, width: cardWidth, height: 55, color: palette.background })
      page.drawRectangle({ x, y: summaryTop - 60, width: cardWidth, height: 55, borderColor: palette.border, borderWidth: 0.5 })
      drawText(card.label, x + 10, summaryTop - 25, { size: 9, color: palette.muted })
      const colorOverride = card.label === "Status" && paymentStatus === "paid" ? palette.secondaryAccent : palette.text
      drawText(card.value, x + 10, summaryTop - 40, { font: "bold", size: 12, color: colorOverride })
    })

    // Line items table
    const tableTop = summaryTop - 90
    drawText("Leistungsübersicht", marginX, tableTop + 10, { font: "bold", size: 14 })
    const tableHeaders = [
      { label: "Beschreibung", width: 240 },
      { label: "Menge", width: 60, align: "right" as const },
      { label: "Einzelpreis", width: 90, align: "right" as const },
      { label: "USt.", width: 60, align: "right" as const },
      { label: "Gesamt", width: 95, align: "right" as const },
    ]
    const tableWidth = tableHeaders.reduce((sum, col) => sum + col.width, 0)
    const tableStartX = marginX

    page.drawRectangle({
      x: tableStartX,
      y: tableTop - 18,
      width: tableWidth,
      height: 24,
      color: palette.secondaryAccent,
    })
    let columnCursor = tableStartX
    tableHeaders.forEach((col) => {
      const padding = col.align === "right" ? col.width - 6 : 6
      drawText(col.label, columnCursor + padding, tableTop - 5, {
        size: 10,
        font: "bold",
        color: rgb(1, 1, 1),
      })
      columnCursor += col.width
    })

    const items = lineItems.length
      ? lineItems
      : [
          {
            description: "VectoBeat Subscription",
            quantity: 1,
            unitAmount: total,
            totalAmount: total,
          },
        ]

    const vatRate =
      subtotal > 0 && taxAmount > 0 ? Math.round((taxAmount / subtotal) * 1000) / 10 : taxAmount > 0 ? 19 : 0
    const vatLabel = vatRate ? `${vatRate.toFixed(1)} %` : "—"

    let currentY = tableTop - 42
    items.forEach((item, index) => {
      const rowColor = index % 2 === 0 ? palette.rowAlt : rgb(1, 1, 1)
      const rowHeight = Math.max(32, wrapText(item.description, tableHeaders[0].width - 12, 10).length * 14 + 12)
      page.drawRectangle({
        x: tableStartX,
        y: currentY - rowHeight + 6,
        width: tableWidth,
        height: rowHeight - 6,
        color: rowColor,
      })

      let cursor = tableStartX
      drawWrappedText(item.description, cursor + 6, currentY - 4, tableHeaders[0].width - 12, 10)
      cursor += tableHeaders[0].width

      const rowValues = [
        String(item.quantity ?? 1),
        formatCurrency(item.unitAmount ?? 0, currency),
        vatLabel,
        formatCurrency(item.totalAmount ?? 0, currency),
      ]

      rowValues.forEach((value, idx) => {
        const col = tableHeaders[idx + 1]
        const textWidth = getFont("regular").widthOfTextAtSize(value, 10)
        const textX = col.align === "right" ? cursor + col.width - textWidth - 6 : cursor + 6
        drawText(value, textX, currentY - 4, { size: 10 })
        cursor += col.width
      })

      currentY -= rowHeight
    })

    // Totals
    const totalsY = currentY - 10
    const totalsBoxWidth = 230
    page.drawRectangle({
      x: tableStartX + tableWidth - totalsBoxWidth,
      y: totalsY - 90,
      width: totalsBoxWidth,
      height: 90,
      color: palette.background,
      borderColor: palette.border,
      borderWidth: 0.6,
    })

    const totalRows = [
      { label: "Zwischensumme", value: formatCurrency(subtotal, currency) },
      { label: `USt. (${vatLabel})`, value: formatCurrency(taxAmount, currency) },
      { label: "Gesamtbetrag", value: formatCurrency(total, currency), bold: true },
    ]
    totalRows.forEach((row, idx) => {
      const y = totalsY - idx * 24 - 12
      drawText(row.label, tableStartX + tableWidth - totalsBoxWidth + 12, y, { size: 10, color: palette.muted })
      const valueWidth = getFont(row.bold ? "bold" : "regular").widthOfTextAtSize(row.value, row.bold ? 12 : 11)
      drawText(row.value, tableStartX + tableWidth - 12 - valueWidth, y, {
        size: row.bold ? 12 : 11,
        font: row.bold ? "bold" : "regular",
        color: row.bold ? palette.secondaryAccent : palette.text,
      })
    })

    // Payment instructions
    const noteY = totalsY - 130
    drawText("Zahlung & Hinweise", marginX, noteY, { font: "bold", size: 13 })
    const noteLines = [
      "Bitte begleichen Sie den Rechnungsbetrag innerhalb von 30 Tagen auf das hinterlegte Geschäftskonto.",
      `Als Verwendungszweck geben Sie bitte die Rechnungsnummer ${displayInvoiceNumber} sowie Ihre Kundennummer ${
        displayCustomerId || "—"
      } an.`,
      "Für Fragen steht das Billing-Team unter billing@vectobeat.com oder telefonisch jederzeit zur Verfügung.",
    ]
    let offset = 0
    noteLines.forEach((line) => {
      offset += drawWrappedText(line, marginX, noteY - 18 - offset, pageWidth - marginX * 2, 10)
    })

    // Footer
    page.drawRectangle({ x: 0, y: 40, width: pageWidth, height: 50, color: palette.header })
    drawText(
      "VectoBeat · c/o UplyTech · Breitenburger Straße 15 · 25524 Itzehoe · Germany",
      marginX,
      68,
      {
        size: 9,
        color: rgb(0.82, 0.83, 0.87),
      },
    )
    drawText(`Telefon: ${COMPANY.phone}   ·   Email: ${COMPANY.email}`, marginX, 54, {
      size: 9,
      color: rgb(0.82, 0.83, 0.87),
    })
    drawText(`USt-ID: ${COMPANY.vatId}   ·   Infrastruktur: Prisma ORM + MySQL`, marginX, 40, {
      size: 9,
      color: rgb(0.82, 0.83, 0.87),
    })

    const fileSuffix = (stripIdentifierPrefix(invoiceNumber) || invoiceNumber || "invoice")
      .replace(/[^A-Za-z0-9-]/g, "")
      .toLowerCase()
    const pdfBytes = await doc.save()
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vectobeat-invoice-${fileSuffix || "details"}.pdf"`,
      },
    })
  } catch (error) {
    console.error("[VectoBeat] Invoice generation failed:", error)
    return NextResponse.json({ error: "Unable to generate invoice" }, { status: 500 })
  }
}
