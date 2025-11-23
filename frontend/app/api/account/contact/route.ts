import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserContact, upsertUserContact } from "@/lib/db"

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchContact?: typeof getUserContact
  saveContact?: typeof upsertUserContact
}

export const createContactHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchContact = deps.fetchContact ?? getUserContact
  const saveContact = deps.saveContact ?? upsertUserContact

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const contact = await fetchContact(discordId)
    return NextResponse.json(contact)
  }

  const putHandler = async (request: NextRequest) => {
    try {
      const { discordId, phone } = await request.json()
      if (!discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }

      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      await saveContact({
        discordId,
        phone: typeof phone === "string" && phone.trim().length ? phone.trim() : null,
      })

      const updated = await fetchContact(discordId)
      return NextResponse.json(updated)
    } catch (error) {
      console.error("[VectoBeat] Failed to update contact:", error)
      return NextResponse.json({ error: "Failed to update contact info" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createContactHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
