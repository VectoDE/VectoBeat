/**
 * OAuth PKCE helpers – unit tests.
 *
 * These exercise the functions that were historically buggy (base64UrlEncode
 * only replaced the FIRST + and /, causing Discord to reject code_verifier).
 */

import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"

// ─── Inline the helpers under test (same logic as login/route.ts) ─────────────

const base64UrlEncode = (input: Buffer): string => input.toString("base64url")

const generateCodeVerifier = (): string => base64UrlEncode(crypto.randomBytes(64))

const generateCodeChallenge = (verifier: string): string =>
    base64UrlEncode(crypto.createHash("sha256").update(verifier).digest())

// ─── Tests ─────────────────────────────────────────────────────────────────────

test("base64UrlEncode – no raw + characters", () => {
    // Run many samples to catch probabilistic failures
    for (let i = 0; i < 200; i++) {
        const encoded = base64UrlEncode(crypto.randomBytes(64))
        assert.ok(!encoded.includes("+"), `Encoded string contains '+': ${encoded}`)
    }
})

test("base64UrlEncode – no raw / characters", () => {
    for (let i = 0; i < 200; i++) {
        const encoded = base64UrlEncode(crypto.randomBytes(64))
        assert.ok(!encoded.includes("/"), `Encoded string contains '/': ${encoded}`)
    }
})

test("base64UrlEncode – no padding = characters", () => {
    for (let i = 0; i < 200; i++) {
        const encoded = base64UrlEncode(crypto.randomBytes(64))
        assert.ok(!encoded.includes("="), `Encoded string contains '=': ${encoded}`)
    }
})

test("base64UrlEncode – only valid base64url charset", () => {
    const validChars = /^[A-Za-z0-9\-_]+$/
    for (let i = 0; i < 200; i++) {
        const encoded = base64UrlEncode(crypto.randomBytes(64))
        assert.match(encoded, validChars, `Invalid chars in: ${encoded}`)
    }
})

test("generateCodeVerifier – meets PKCE minimum length (43 chars)", () => {
    for (let i = 0; i < 20; i++) {
        const verifier = generateCodeVerifier()
        assert.ok(
            verifier.length >= 43,
            `Verifier too short (${verifier.length}): ${verifier}`,
        )
    }
})

test("generateCodeVerifier – within PKCE maximum length (128 chars)", () => {
    for (let i = 0; i < 20; i++) {
        const verifier = generateCodeVerifier()
        assert.ok(
            verifier.length <= 128,
            `Verifier too long (${verifier.length}): ${verifier}`,
        )
    }
})

test("generateCodeVerifier – only valid unreserved chars", () => {
    const validChars = /^[A-Za-z0-9\-._~]+$/
    for (let i = 0; i < 20; i++) {
        const verifier = generateCodeVerifier()
        assert.match(verifier, validChars, `Invalid verifier chars: ${verifier}`)
    }
})

test("generateCodeChallenge – is non-empty", () => {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    assert.ok(challenge.length > 0)
})

test("generateCodeChallenge – is deterministic for the same verifier", () => {
    const verifier = "fixed-verifier-string"
    const c1 = generateCodeChallenge(verifier)
    const c2 = generateCodeChallenge(verifier)
    assert.equal(c1, c2)
})

test("generateCodeChallenge – differs for different verifiers", () => {
    const c1 = generateCodeChallenge(generateCodeVerifier())
    const c2 = generateCodeChallenge(generateCodeVerifier())
    assert.notEqual(c1, c2)
})

test("generateCodeChallenge – is valid base64url", () => {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    const validChars = /^[A-Za-z0-9\-_]+$/
    assert.match(challenge, validChars)
    assert.ok(!challenge.includes("="))
})
