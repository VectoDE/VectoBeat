import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createApiTokenHandlers } from "@/app/api/control-panel/api-tokens/route"
import { type GuildAccessResult } from "@/lib/control-panel-auth"

let events: any[] = []
let settingsStore: Record<string, any> = {}

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

const happyAccess: GuildAccessResult = {
  ok: true,
  tier: "pro",
  subscription: { id: "sub1", discordServerId: "g1", tier: "pro", status: "active" } as any,
  user: { id: "u1", username: "tester", email: "tester@test.tld" },
} as const

const fetchSettings = async (guildId: string) => settingsStore[guildId] || { apiTokens: [] }
const saveSettings = async (guildId: string, _discordId: string, payload: any) => {
  settingsStore[guildId] = { ...(settingsStore[guildId] || {}), ...payload }
}
const recordEvent = async (payload: any) => {
  events.push(payload)
}
const email = async () => {}

const handlers = createApiTokenHandlers({
  verifyAccess: async () => happyAccess,
  fetchSettings,
  saveSettings,
  recordEvent,
  email,
})

test("API token creation records actor identity", async () => {
  settingsStore = { g1: { apiTokens: [] } }
  events = []
  const response = await handlers.POST(
    buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
      method: "POST",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", label: "prod" }),
    }),
  )
  assert.equal(response.status, 200)
  const event = events.find((e) => e.action === "created")
  assert.equal(event?.actorId, "u1")
  assert.equal(event?.actorName, "tester")
})

test("API token rotation falls back to discordId when profile missing", async () => {
  const noProfileHandlers = createApiTokenHandlers({
    verifyAccess: async (_req, discordId, guildId) => ({
      ...happyAccess,
      user: discordId === "u2" ? null : happyAccess.user,
      subscription: { id: "sub1", discordServerId: guildId, tier: "pro", status: "active" } as any,
    }),
    fetchSettings,
    saveSettings,
    recordEvent,
    email,
  })
  settingsStore = {
    g1: {
      apiTokens: [
        {
          id: "t1",
          label: "prod",
          hash: "hash",
          lastFour: "1234",
          createdAt: new Date().toISOString(),
          scopes: [],
          status: "active",
          leakDetected: false,
        },
      ],
    },
  }
  events = []
  const response = await noProfileHandlers.PATCH(
    buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
      method: "PATCH",
      body: JSON.stringify({ guildId: "g1", discordId: "u2", tokenId: "t1", action: "rotate" }),
    }),
  )
  assert.equal(response.status, 200)
  const event = events.find((e) => e.action === "rotated")
  assert.equal(event?.actorId, "u2")
  assert.equal(event?.actorName, "u2")
})

test("API token leak marker includes actor metadata", async () => {
  settingsStore = {
    g1: {
      apiTokens: [
        {
          id: "t1",
          label: "prod",
          hash: "hash",
          lastFour: "1234",
          createdAt: new Date().toISOString(),
          scopes: [],
          status: "active",
          leakDetected: false,
        },
      ],
    },
  }
  events = []
  const response = await handlers.PATCH(
    buildRequest("https://vectobeat.test/api/control-panel/api-tokens", {
      method: "PATCH",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", tokenId: "t1", action: "mark_leak" }),
    }),
  )
  assert.equal(response.status, 200)
  const event = events.find((e) => e.action === "mark_leak")
  assert.equal(event?.actorName, "tester")
})
