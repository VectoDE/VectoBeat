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
import * as queueSyncModule from "@/pages/api/queue-sync"

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

test("queue-sync contract accepts authorized payloads", async () => {
  const createQueueSyncHandler = queueSyncModule.createQueueSyncHandler as any
  const store = new Map<string, any>()
  const handler = createQueueSyncHandler({
    apiKey: "secret",
    getSnapshot: async (guildId: string) => store.get(guildId) ?? null,
    saveSnapshot: async (snapshot: any) => {
      store.set(snapshot.guildId, snapshot)
      return snapshot
    },
    ensureSocket: async () => ({ to: () => ({ emit: () => {} }) } as any),
  })

  const resPost: any = {
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.body = body
      return this
    },
  }
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body: { guildId: "g1", queue: [], nowPlaying: null, updatedAt: new Date().toISOString() },
    } as any,
    resPost,
  )
  assert.equal(resPost.statusCode, 200)
})
