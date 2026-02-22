/**
 * api-keys – unit tests.
 *
 * Tests the type alias normalisation and env-variable fallback behaviour
 * which determines whether bot requests are authenticated correctly.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { normalizeApiKeyType, getApiKeySecrets, invalidateApiKeyCache } from "@/lib/api-keys"

// ─── normalizeApiKeyType ───────────────────────────────────────────────────────

test("normalizeApiKeyType – maps 'status_api' to canonical form", () => {
    assert.equal(normalizeApiKeyType("status_api"), "status_api")
})

test("normalizeApiKeyType – maps 'STATUS_API_KEY' alias to status_api", () => {
    assert.equal(normalizeApiKeyType("STATUS_API_KEY"), "status_api")
})

test("normalizeApiKeyType – maps 'BOT_STATUS_API_KEY' alias to status_api", () => {
    assert.equal(normalizeApiKeyType("BOT_STATUS_API_KEY"), "status_api")
})

test("normalizeApiKeyType – maps 'status_events' correctly", () => {
    assert.equal(normalizeApiKeyType("STATUS_API_PUSH_SECRET"), "status_events")
    assert.equal(normalizeApiKeyType("STATUS_API_EVENT_SECRET"), "status_events")
})

test("normalizeApiKeyType – maps 'CONTROL_PANEL_API_KEY' to control_panel", () => {
    assert.equal(normalizeApiKeyType("CONTROL_PANEL_API_KEY"), "control_panel")
})

test("normalizeApiKeyType – maps 'QUEUE_SYNC_API_KEY' to queue_sync", () => {
    assert.equal(normalizeApiKeyType("QUEUE_SYNC_API_KEY"), "queue_sync")
})

test("normalizeApiKeyType – lowercases unknown types as fallback", () => {
    assert.equal(normalizeApiKeyType("MY_CUSTOM_TYPE"), "my_custom_type")
})

// ─── getApiKeySecrets – env fallbacks ─────────────────────────────────────────

test("getApiKeySecrets – returns env fallback for status_api when includeEnv=true", async () => {
    invalidateApiKeyCache(["status_api"])
    process.env.STATUS_API_KEY = "test-status-key-from-env"
    const secrets = await getApiKeySecrets(["status_api"], { includeEnv: true })
    assert.ok(secrets.includes("test-status-key-from-env"), `Expected env key in: ${JSON.stringify(secrets)}`)
    delete process.env.STATUS_API_KEY
    invalidateApiKeyCache(["status_api"])
})

test("getApiKeySecrets – skips env fallback when includeEnv=false", async () => {
    invalidateApiKeyCache(["status_api"])
    process.env.STATUS_API_KEY = "should-not-appear"
    const secrets = await getApiKeySecrets(["status_api"], { includeEnv: false })
    assert.ok(!secrets.includes("should-not-appear"), `Env key leaked into: ${JSON.stringify(secrets)}`)
    delete process.env.STATUS_API_KEY
    invalidateApiKeyCache(["status_api"])
})

test("getApiKeySecrets – returns empty array for unknown type with no env", async () => {
    invalidateApiKeyCache(["unknown_type_xyz"])
    const secrets = await getApiKeySecrets(["unknown_type_xyz"], { includeEnv: true })
    assert.ok(Array.isArray(secrets))
    assert.equal(secrets.length, 0)
})

test("getApiKeySecrets – deduplicates returned secrets", async () => {
    invalidateApiKeyCache(["status_api"])
    process.env.STATUS_API_KEY = "dup-key"
    process.env.BOT_STATUS_API_KEY = "dup-key"
    const secrets = await getApiKeySecrets(["status_api"], { includeEnv: true })
    const unique = new Set(secrets)
    assert.equal(unique.size, secrets.length, "Duplicates found in secrets")
    delete process.env.STATUS_API_KEY
    delete process.env.BOT_STATUS_API_KEY
    invalidateApiKeyCache(["status_api"])
})
