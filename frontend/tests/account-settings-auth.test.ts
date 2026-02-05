import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { createContactHandlers } from "@/app/api/account/contact/route"
import { createProfileHandlers } from "@/app/api/account/profile/route"
import { createPrivacyHandlers } from "@/app/api/account/privacy/route"
import { createNotificationHandlers } from "@/app/api/account/notifications/route"
import { createBotSettingsHandlers } from "@/app/api/account/bot-settings/route"
import { createLinkedAccountHandlers } from "@/app/api/account/linked-accounts/route"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

const invalidVerifier = async () => ({ valid: false, token: null, sessionHash: null, user: null })
const failIfCalled = () => {
  throw new Error("Data layer should not be hit for invalid sessions")
}

test("account contact endpoints require valid session", async () => {
  const { GET, PUT } = createContactHandlers({
    verifyUser: invalidVerifier,
    fetchContact: failIfCalled,
    saveContact: failIfCalled,
  })
  const getResponse = await GET(buildRequest("https://vectobeat.test/api/account/contact?discordId=user-1"))
  assert.equal(getResponse.status, 401)

  const putResponse = await PUT(
    buildRequest("https://vectobeat.test/api/account/contact", {
      method: "PUT",
      body: JSON.stringify({ discordId: "user-1", phone: "+123" }),
    }),
  )
  assert.equal(putResponse.status, 401)
})

test("account profile update rejects unauthorized access", async () => {
  const { PUT } = createProfileHandlers({
    verifyUser: invalidVerifier,
    saveProfile: failIfCalled,
  })
  const response = await PUT(
    buildRequest("https://vectobeat.test/api/account/profile", {
      method: "PUT",
      body: JSON.stringify({ discordId: "user-1", displayName: "Jane" }),
    }),
  )
  assert.equal(response.status, 401)
})

test("account privacy update rejects unauthorized access", async () => {
  const { PUT } = createPrivacyHandlers({
    verifyUser: invalidVerifier,
    savePrivacy: failIfCalled,
  })
  const response = await PUT(
    buildRequest("https://vectobeat.test/api/account/privacy", {
      method: "PUT",
      body: JSON.stringify({ discordId: "user-1", profilePublic: false }),
    }),
  )
  assert.equal(response.status, 401)
})

test("notification settings update requires a valid session", async () => {
  const { PUT } = createNotificationHandlers({
    verifyUser: invalidVerifier,
    saveNotifications: failIfCalled,
    notify: failIfCalled,
  })
  const response = await PUT(
    buildRequest("https://vectobeat.test/api/account/notifications", {
      method: "PUT",
      body: JSON.stringify({ discordId: "user-1", betaProgram: true }),
    }),
  )
  assert.equal(response.status, 401)
})

test("bot settings endpoints are locked down", async () => {
  const { GET, PUT } = createBotSettingsHandlers({
    verifyUser: invalidVerifier,
    fetchBotSettings: failIfCalled,
    saveBotSettings: failIfCalled,
  })
  const getResponse = await GET(buildRequest("https://vectobeat.test/api/account/bot-settings?discordId=user-1"))
  assert.equal(getResponse.status, 401)

  const putResponse = await PUT(
    buildRequest("https://vectobeat.test/api/account/bot-settings", {
      method: "PUT",
      body: JSON.stringify({ discordId: "user-1", language: "en" }),
    }),
  )
  assert.equal(putResponse.status, 401)
})

test("linked accounts routes enforce session ownership", async () => {
  const { GET, POST, DELETE } = createLinkedAccountHandlers({
    verifyUser: invalidVerifier,
    fetchLinkedAccounts: failIfCalled,
    linkAccount: failIfCalled,
    deleteLinkedAccount: failIfCalled,
  })

  const getResponse = await GET(
    buildRequest("https://vectobeat.test/api/account/linked-accounts?discordId=user-1"),
  )
  assert.equal(getResponse.status, 401)

  const postResponse = await POST(
    buildRequest("https://vectobeat.test/api/account/linked-accounts", {
      method: "POST",
      body: JSON.stringify({ discordId: "user-1", provider: "github", handle: "octocat" }),
    }),
  )
  assert.equal(postResponse.status, 401)

  const deleteResponse = await DELETE(
    buildRequest("https://vectobeat.test/api/account/linked-accounts", {
      method: "DELETE",
      body: JSON.stringify({ discordId: "user-1", accountId: "acc-1" }),
    }),
  )
  assert.equal(deleteResponse.status, 401)
})
