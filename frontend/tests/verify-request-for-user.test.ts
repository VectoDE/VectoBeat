import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"

const buildRequest = (url: string, token?: string) =>
  new NextRequest(new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }))

test("verifyRequestForUser returns profile when session is valid", async () => {
  const request = buildRequest("https://vectobeat.test/api?discordId=u1", "tok123")
  const result = await verifyRequestForUser(request, "u1", {
    validate: async () => true,
    loadProfile: async () => ({
      id: "u1",
      username: "tester",
      email: "u1@test.tld",
      guilds: [{ id: "g1", name: "Guild One" }],
    }),
  })
  assert.equal(result.valid, true)
  assert.equal(result.token, "tok123")
  assert(result.user)
  assert.equal(result.user?.id, "u1")
  assert.equal(result.user?.email, "u1@test.tld")
})

test("verifyRequestForUser rejects invalid sessions", async () => {
  const request = buildRequest("https://vectobeat.test/api?discordId=u1", "tok123")
  const result = await verifyRequestForUser(request, "u1", {
    validate: async () => false,
    loadProfile: async () => {
      throw new Error("should not load")
    },
  })
  assert.equal(result.valid, false)
  assert.equal(result.user, null)
})

test("verifyRequestForUser rejects when no token present", async () => {
  const request = buildRequest("https://vectobeat.test/api?discordId=u1")
  const result = await verifyRequestForUser(request, "u1", {
    validate: async () => true,
    loadProfile: async () => ({
      id: "u1",
      username: "tester",
      email: "u1@test.tld",
      guilds: [],
    }),
  })
  assert.equal(result.valid, false)
  assert.equal(result.user, null)
})
