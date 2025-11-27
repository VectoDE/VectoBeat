import type Stripe from "stripe"
import { stripe } from "./stripe"
import { getUserContact, upsertUserContact } from "./db"

type EnsureStripeCustomerParams = {
  discordId: string
  email?: string | null
  phone?: string | null
  name?: string | null
  contact?: { email?: string | null; phone?: string | null; stripeCustomerId?: string | null }
}

export const ensureStripeCustomerForUser = async (params: EnsureStripeCustomerParams) => {
  try {
    const contact = params.contact ?? (await getUserContact(params.discordId))
    if (contact && "stripeCustomerId" in contact && contact.stripeCustomerId) {
      return contact.stripeCustomerId
    }

    const email = params.email ?? contact?.email ?? undefined
    const phone = params.phone ?? contact?.phone ?? undefined
    const name = params.name ?? undefined

    const candidate = email ? await stripe.customers.list({ email, limit: 1 }) : null
    const existing = candidate?.data?.[0]

    let customer =
      existing ??
      (await stripe.customers.create({
        email,
        phone,
        name,
        metadata: { discordId: params.discordId },
      }))

    const updatePayload: Stripe.CustomerUpdateParams = {}
    if (phone && phone !== customer.phone) {
      updatePayload.phone = phone
    }
    if (name && name !== customer.name) {
      updatePayload.name = name
    }

    if (Object.keys(updatePayload).length > 0) {
      customer = await stripe.customers.update(customer.id, updatePayload)
    }

    await upsertUserContact({
      discordId: params.discordId,
      email: customer.email ?? email ?? null,
      phone: customer.phone ?? phone ?? null,
      stripeCustomerId: customer.id,
    })

    return customer.id
  } catch (error) {
    console.error("[VectoBeat] Failed to ensure Stripe customer:", error)
    return params.contact?.stripeCustomerId ?? null
  }
}
