import { type NextRequest, NextResponse } from "next/server"
import { deleteSubscriptionById, getSubscriptionById, updateSubscriptionById } from "@/lib/db"

type SubscriptionRouteParams = { params: Promise<{ id: string }> }

const parseDateInput = (value: unknown) => {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parsePrice = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const parseString = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export async function GET(_request: NextRequest, { params }: SubscriptionRouteParams) {
  try {
    const { id } = await params
    const subscription = await getSubscriptionById(id)
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    return NextResponse.json(subscription)
  } catch (error) {
    console.error("[VectoBeat] Get subscription error:", error)
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: SubscriptionRouteParams) {
  try {
    const { id } = await params

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    const updates: {
      tier?: string
      status?: string
      monthlyPrice?: number
      guildName?: string | null
      guildId?: string
      currentPeriodStart?: Date
      currentPeriodEnd?: Date
    } = {}

    if ("tier" in payload) {
      const value = parseString((payload as Record<string, unknown>).tier)
      if (!value) {
        return NextResponse.json({ error: "tier must be a non-empty string" }, { status: 400 })
      }
      updates.tier = value
    }

    if ("status" in payload) {
      const value = parseString((payload as Record<string, unknown>).status)
      if (!value) {
        return NextResponse.json({ error: "status must be a non-empty string" }, { status: 400 })
      }
      updates.status = value
    }

    if ("monthlyPrice" in payload || "pricePerMonth" in payload) {
      const price = parsePrice(
        (payload as Record<string, unknown>).monthlyPrice ?? (payload as Record<string, unknown>).pricePerMonth,
      )
      if (price === null) {
        return NextResponse.json({ error: "monthlyPrice must be a finite number" }, { status: 400 })
      }
      updates.monthlyPrice = price
    }

    if ("guildName" in payload) {
      const value = parseString((payload as Record<string, unknown>).guildName)
      updates.guildName = value
    }

    if ("guildId" in payload) {
      const value = parseString((payload as Record<string, unknown>).guildId)
      if (!value) {
        return NextResponse.json({ error: "guildId must be a non-empty string" }, { status: 400 })
      }
      updates.guildId = value
    }

    if ("currentPeriodStart" in payload) {
      const value = parseDateInput((payload as Record<string, unknown>).currentPeriodStart)
      if (value) {
        updates.currentPeriodStart = value
      }
    }

    if ("currentPeriodEnd" in payload) {
      const value = parseDateInput((payload as Record<string, unknown>).currentPeriodEnd)
      if (value) {
        updates.currentPeriodEnd = value
      }
    }

    const updated = await updateSubscriptionById(id, updates)
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("[VectoBeat] Update subscription error:", error)
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: SubscriptionRouteParams) {
  try {
    const { id } = await params
    const success = await deleteSubscriptionById(id)
    if (!success) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[VectoBeat] Delete subscription error:", error)
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 })
  }
}
