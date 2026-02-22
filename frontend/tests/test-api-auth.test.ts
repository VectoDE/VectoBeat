/**
 * api-auth – unit tests.
 *
 * Tests extractToken and authorizeRequest, the core auth primitives
 * used on every bot-facing API route.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { extractToken, authorizeRequest, normalizeToken } from "@/lib/api-auth"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildReq = (url: string, headers: Record<string, string> = {}) =>
    new NextRequest(new Request(url, { headers }))

// ─── normalizeToken ────────────────────────────────────────────────────────────

test("normalizeToken – trims whitespace", () => {
    assert.equal(normalizeToken("  my-token  "), "my-token")
})

test("normalizeToken – strips surrounding quotes", () => {
    assert.equal(normalizeToken('"my-token"'), "my-token")
    assert.equal(normalizeToken("'my-token'"), "my-token")
})

test("normalizeToken – returns empty string for null/undefined", () => {
    assert.equal(normalizeToken(null), "")
    assert.equal(normalizeToken(undefined), "")
})

// ─── extractToken ─────────────────────────────────────────────────────────────

test("extractToken – extracts Bearer token from Authorization header", () => {
    const req = buildReq("https://test.local/api", { authorization: "Bearer abc123" })
    assert.equal(extractToken(req), "abc123")
})

test("extractToken – extracts token from x-api-key header", () => {
    const req = buildReq("https://test.local/api", { "x-api-key": "mykey" })
    assert.equal(extractToken(req), "mykey")
})

test("extractToken – extracts token from x-status-api-key header", () => {
    const req = buildReq("https://test.local/api", { "x-status-api-key": "statuskey" })
    assert.equal(extractToken(req), "statuskey")
})

test("extractToken – extracts token from query param ?token=", () => {
    const req = buildReq("https://test.local/api?token=querytoken")
    assert.equal(extractToken(req), "querytoken")
})

test("extractToken – returns null when no token present", () => {
    const req = buildReq("https://test.local/api")
    assert.equal(extractToken(req), null)
})

test("extractToken – prefers Authorization header over x-api-key", () => {
    const req = buildReq("https://test.local/api", {
        authorization: "Bearer bearertoken",
        "x-api-key": "apikey",
    })
    assert.equal(extractToken(req), "bearertoken")
})

// ─── authorizeRequest ─────────────────────────────────────────────────────────

test("authorizeRequest – returns true for correct Bearer token", () => {
    const req = buildReq("https://test.local/api", { authorization: "Bearer correct-token" })
    assert.equal(authorizeRequest(req, ["correct-token"]), true)
})

test("authorizeRequest – returns false for wrong token", () => {
    const req = buildReq("https://test.local/api", { authorization: "Bearer wrong-token" })
    assert.equal(authorizeRequest(req, ["correct-token"]), false)
})

test("authorizeRequest – returns false when no token provided", () => {
    const req = buildReq("https://test.local/api")
    assert.equal(authorizeRequest(req, ["correct-token"]), false)
})

test("authorizeRequest – returns true when allowedSecrets is empty", () => {
    // Empty allowlist = no credentials configured = passthrough
    const req = buildReq("https://test.local/api")
    assert.equal(authorizeRequest(req, []), true)
})

test("authorizeRequest – allows localhost when allowLocalhost=true", () => {
    const req = buildReq("https://test.local/api", { host: "localhost" })
    assert.equal(authorizeRequest(req, ["secret"], { allowLocalhost: true }), true)
})

test("authorizeRequest – does NOT bypass non-localhost when allowLocalhost=true", () => {
    const req = buildReq("https://test.local/api", { host: "external.host.com" })
    assert.equal(authorizeRequest(req, ["secret"], { allowLocalhost: true }), false)
})
