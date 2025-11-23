import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserRole, listAdminUsers, setUserRole, type UserRole } from "@/lib/db"

const isPrivileged = (role: UserRole) => role === "admin" || role === "operator"

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

  const users = await listAdminUsers()
  return NextResponse.json({ users })
}

export async function PATCH(request: NextRequest) {
  try {
    const { discordId, targetId, role } = await request.json()
    if (!discordId || !targetId || !role) {
      return NextResponse.json({ error: "discordId, targetId, and role are required" }, { status: 400 })
    }

    const auth = await verifyRequestForUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requesterRole = await getUserRole(discordId)
    if (!isPrivileged(requesterRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    if (!["member", "admin", "operator"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const updatedRole = await setUserRole(targetId, role as UserRole)
    return NextResponse.json({ success: true, role: updatedRole })
  } catch (error) {
    console.error("[VectoBeat] Failed to update user role:", error)
    return NextResponse.json({ error: "Unable to update user role" }, { status: 500 })
  }
}
