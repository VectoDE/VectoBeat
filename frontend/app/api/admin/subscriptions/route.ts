import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, listAllSubscriptions, updateSubscriptionById, upsertSubscription } from "@/lib/db"

const isPrivileged = (role: string) => role === "admin" || role === "operator"

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = await getUserRole(discordId)
  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const subscriptions = await listAllSubscriptions()
  return NextResponse.json({ subscriptions })
}

export async function POST(request: NextRequest) {
  try {
    const { discordId, updates } = await request.json()
    if (!discordId || !updates) {
      return NextResponse.json({ error: "discordId and updates are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (!isPrivileged(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const targetDiscordId =
      typeof updates.discordId === "string" && updates.discordId.trim().length
        ? updates.discordId.trim()
        : discordId
    const guildId = updates.discordServerId || updates.guildId
    if (!guildId) {
      return NextResponse.json({ error: "discordServerId (guild) is required" }, { status: 400 })
    }

    const parseDate = (value: any) => {
      const date = value ? new Date(value) : null
      return date && !Number.isNaN(date.getTime()) ? date : null
    }

    const currentPeriodStart = parseDate(updates.currentPeriodStart) ?? new Date()
    const currentPeriodEnd = parseDate(updates.currentPeriodEnd) ?? new Date()

    const subscription = await upsertSubscription({
      id: updates.subscriptionId || updates.id || `manual_${randomUUID()}`,
      discordId: targetDiscordId,
      guildId,
      guildName: updates.name ?? updates.guildName ?? null,
      stripeCustomerId: updates.stripeCustomerId ?? null,
      tier: updates.tier || "starter",
      status: updates.status || "active",
      monthlyPrice: typeof updates.pricePerMonth === "number" ? updates.pricePerMonth : 0,
      currentPeriodStart,
      currentPeriodEnd,
    })

    if (!subscription) {
      return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 })
    }

    return NextResponse.json({ subscription })
  } catch (error) {
    console.error("[VectoBeat] Failed to create subscription:", error)
    return NextResponse.json({ error: "Unable to create subscription" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { discordId, subscriptionId, updates } = await request.json()
    if (!discordId || !subscriptionId || !updates) {
      return NextResponse.json({ error: "discordId, subscriptionId, and updates are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(discordId)
    if (!isPrivileged(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const payload: Record<string, any> = {}
    if (typeof updates.status === "string") {
      payload.status = updates.status
    }
    if (typeof updates.tier === "string") {
      payload.tier = updates.tier
    }
    if (typeof updates.pricePerMonth === "number" && Number.isFinite(updates.pricePerMonth)) {
      payload.monthlyPrice = updates.pricePerMonth
    }
    if (typeof updates.guildName === "string" || updates.guildName === null) {
      payload.guildName = updates.guildName
    }
    if (typeof updates.currentPeriodStart === "string") {
      payload.currentPeriodStart = new Date(updates.currentPeriodStart)
    }
    if (typeof updates.currentPeriodEnd === "string") {
      payload.currentPeriodEnd = new Date(updates.currentPeriodEnd)
    }

    const updated = await updateSubscriptionById(subscriptionId, payload)
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    return NextResponse.json({ subscription: updated })
  } catch (error) {
    console.error("[VectoBeat] Failed to update subscription:", error)
    return NextResponse.json({ error: "Unable to update subscription" }, { status: 500 })
  }
}
