import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createServerSettingsHandlers } from "@/app/api/control-panel/server-settings/route"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("server settings GET denies unauthorized guild access", async () => {
  const { GET } = createServerSettingsHandlers({
    verifyAccess: async () => ({ ok: false, status: 403, code: "guild_not_accessible" }),
  })
  const response = await GET(
    buildRequest("https://vectobeat.test/api/control-panel/server-settings?guildId=g1&discordId=u1"),
  )
  assert.equal(response.status, 403)
  const payload = await response.json()
  assert.deepEqual(payload, { error: "guild_not_accessible" })
})

test("server settings PUT denies unauthorized writes", async () => {
  const { PUT } = createServerSettingsHandlers({
    verifyAccess: async () => ({ ok: false, status: 401, code: "unauthorized" }),
  })
  const response = await PUT(
    buildRequest("https://vectobeat.test/api/control-panel/server-settings", {
      method: "PUT",
      body: JSON.stringify({ guildId: "g1", discordId: "u1", settings: {} }),
    }),
  )
  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.deepEqual(payload, { error: "unauthorized" })
})
