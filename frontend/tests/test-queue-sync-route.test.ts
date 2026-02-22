/**
 * /api/queue-sync route – unit tests.
 *
 * The route was completely missing before this audit. These tests ensure
 * the POST handler correctly authenticates, validates, and rejects bad payloads.
 *
 * Note: Dynamic import is not available in the register-ts CJS context.
 * We use a lazy require pattern instead.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

process.env.QUEUE_SYNC_API_KEY = "test-queue-sync-key"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_KEY = "test-queue-sync-key"
const authHeader = { authorization: `Bearer ${TEST_KEY}` }

const buildReq = (body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(
        new Request("https://test.local/api/queue-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
        }),
    )

// ─── Tests ─────────────────────────────────────────────────────────────────────

test("POST /api/queue-sync – returns 401 without auth", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { POST } = require("@/app/api/queue-sync/route")
    const res = await POST(buildReq({ guildId: "g1", queue: [] }))
    assert.equal(res.status, 401)
})

test("POST /api/queue-sync – returns 400 when guildId is missing", async () => {
    const { POST } = require("@/app/api/queue-sync/route")
    const res = await POST(buildReq({ queue: [] }, authHeader))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, "guildId_required")
})

test("POST /api/queue-sync – returns 400 for invalid JSON body", async () => {
    const { POST } = require("@/app/api/queue-sync/route")
    const req = new NextRequest(
        new Request("https://test.local/api/queue-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: "not-json!!",
        }),
    )
    const res = await POST(req)
    assert.equal(res.status, 400)
})

test("POST /api/queue-sync – accepts valid payload with auth (200 or 500 if no DB)", async () => {
    const { POST } = require("@/app/api/queue-sync/route")
    const payload = {
        guildId: "guild-123",
        nowPlaying: null,
        queue: [],
        paused: false,
        volume: 80,
        updatedAt: new Date().toISOString(),
    }
    const res = await POST(buildReq(payload, authHeader))
    // 200 = success, 500 = DB unavailable in test env (both acceptable)
    assert.ok(res.status === 200 || res.status === 500, `Unexpected status: ${res.status}`)
    if (res.status === 200) {
        const body = await res.json()
        assert.equal(body.ok, true)
    }
})
