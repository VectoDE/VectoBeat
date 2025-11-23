import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createDashboardOverviewHandlers } from "@/app/api/dashboard/overview/route"
import { createSubscriptionsHandlers } from "@/app/api/subscriptions/route"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

const invalidVerifier = async () => ({ valid: false, token: null, sessionHash: null })
const failIfCalled = () => {
  throw new Error("Handler should not hit data layer when unauthorized")
}

test("dashboard overview denies requests without a valid session", async () => {
  const { GET } = createDashboardOverviewHandlers({
    verifyUser: invalidVerifier,
    fetchSubscriptions: failIfCalled,
    fetchBotStatus: failIfCalled,
  })

  const response = await GET(buildRequest("https://vectobeat.test/api/dashboard/overview?discordId=user-1"))
  assert.equal(response.status, 401)
})

test("subscriptions endpoint blocks unauthorized access", async () => {
  const { GET } = createSubscriptionsHandlers({
    verifyUser: invalidVerifier,
    syncFromStripe: failIfCalled,
    fetchSubscriptions: failIfCalled,
  })

  const response = await GET(buildRequest("https://vectobeat.test/api/subscriptions?userId=user-1"))
  assert.equal(response.status, 401)
})
