import { NextResponse, type NextRequest } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { addLinkedAccount, getLinkedAccounts, removeLinkedAccount } from "@/lib/db"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchLinkedAccounts?: typeof getLinkedAccounts
  linkAccount?: typeof addLinkedAccount
  deleteLinkedAccount?: typeof removeLinkedAccount
}

export const createLinkedAccountHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchLinkedAccounts = deps.fetchLinkedAccounts ?? getLinkedAccounts
  const linkAccount = deps.linkAccount ?? addLinkedAccount
  const deleteLinkedAccount = deps.deleteLinkedAccount ?? removeLinkedAccount

  const getHandler = async (request: NextRequest) => {
    try {
      const discordId = request.nextUrl.searchParams.get("discordId")
      if (!discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
      const accounts = await fetchLinkedAccounts(discordId)
      return NextResponse.json({ accounts })
    } catch (error) {
      console.error("[VectoBeat] Linked accounts GET failed:", error)
      return NextResponse.json({ error: "Unable to load linked accounts" }, { status: 500 })
    }
  }

  const postHandler = async (request: NextRequest) => {
    try {
      const { discordId, provider, handle, metadata } = await request.json()
      if (!discordId || !provider || !handle) {
        return NextResponse.json({ error: "discordId, provider, and handle are required" }, { status: 400 })
      }
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
      await linkAccount(discordId, provider, handle, metadata)
      const accounts = await fetchLinkedAccounts(discordId)
      return NextResponse.json({ accounts })
    } catch (error) {
      console.error("[VectoBeat] Linked accounts POST failed:", error)
      return NextResponse.json({ error: "Unable to add linked account" }, { status: 500 })
    }
  }

  const deleteHandler = async (request: NextRequest) => {
    try {
      const { discordId, accountId } = await request.json()
      if (!discordId || !accountId) {
        return NextResponse.json({ error: "discordId and accountId are required" }, { status: 400 })
      }
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
      await deleteLinkedAccount(discordId, accountId)
      const accounts = await fetchLinkedAccounts(discordId)
      return NextResponse.json({ accounts })
    } catch (error) {
      console.error("[VectoBeat] Linked accounts DELETE failed:", error)
      return NextResponse.json({ error: "Unable to remove linked account" }, { status: 500 })
    }
  }

  return { GET: getHandler, POST: postHandler, DELETE: deleteHandler }
}

const defaultHandlers = createLinkedAccountHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST
export const DELETE = defaultHandlers.DELETE
