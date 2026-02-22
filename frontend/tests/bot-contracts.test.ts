process.env.SUCCESS_POD_API_SECRET = process.env.SUCCESS_POD_API_SECRET || "test-secret"
process.env.AUTOMATION_LOG_SECRET = process.env.AUTOMATION_LOG_SECRET || "log-secret"
process.env.SCALE_CONTACT_API_SECRET = process.env.SCALE_CONTACT_API_SECRET || "scale-secret"

import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createBotConciergeHandlers } from "@/app/api/bot/concierge/route"
import * as successPodModule from "@/app/api/bot/success-pod/route"
import * as automationActions from "@/app/api/bot/automation-actions/route"
import * as scaleContactModule from "@/app/api/bot/scale-contact/route"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("bot concierge rejects unauthorized usage", async () => {
  const { GET } = createBotConciergeHandlers({ secret: "secret" })
  const res = await GET(buildRequest("https://vectobeat.test/api/bot/concierge?action=usage&guildId=g1"))
  assert.equal(res.status, 401)
})

test("bot success-pod requires auth header", async () => {
  const res = await successPodModule.POST(
    buildRequest("https://vectobeat.test/api/bot/success-pod", {
      method: "POST",
      body: JSON.stringify({ action: "create", guildId: "g1", contact: "me" }),
    }),
  )
  assert.equal(res.status, 401)
})

test("bot automation-actions enforces authorization", async () => {
  process.env.AUTOMATION_LOG_SECRET = "log-secret"
  const res = await automationActions.POST(
    buildRequest("https://vectobeat.test/api/bot/automation-actions", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: JSON.stringify({ guildId: "g1", action: "event" }),
    }),
  )
  assert.equal(res.status, 401)
})

test("bot scale-contact requires auth", async () => {
  const res = await scaleContactModule.GET(buildRequest("https://vectobeat.test/api/bot/scale-contact"))
  assert.equal(res.status, 401)
})

