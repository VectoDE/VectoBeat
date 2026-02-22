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

const runEncodingCheck = (name: string, checkFn: (encoded: string) => void) => {
    test(`base64UrlEncode – ${name}`, () => {
        for (let i = 0; i < 200; i++) {
            checkFn(base64UrlEncode(crypto.randomBytes(64)))
        }
    })
}

runEncodingCheck("no raw + characters", (encoded) => assert.ok(!encoded.includes("+"), `Encoded string contains '+': ${encoded}`))
runEncodingCheck("no raw / characters", (encoded) => assert.ok(!encoded.includes("/"), `Encoded string contains '/': ${encoded}`))
runEncodingCheck("no padding = characters", (encoded) => assert.ok(!encoded.includes("="), `Encoded string contains '=': ${encoded}`))
runEncodingCheck("only valid base64url charset", (encoded) => assert.match(encoded, /^[A-Za-z0-9\-_]+$/, `Invalid chars in: ${encoded}`))

const runVerifierCheck = (name: string, checkFn: (verifier: string) => void) => {
    test(`generateCodeVerifier – ${name}`, () => {
        for (let i = 0; i < 20; i++) {
            checkFn(generateCodeVerifier())
        }
    })
}

runVerifierCheck("meets PKCE minimum length (43 chars)", (ver) => assert.ok(ver.length >= 43, `Too short: ${ver}`))
runVerifierCheck("within PKCE maximum length (128 chars)", (ver) => assert.ok(ver.length <= 128, `Too long: ${ver}`))
runVerifierCheck("only valid unreserved chars", (ver) => assert.match(ver, /^[A-Za-z0-9\-._~]+$/, `Invalid chars: ${ver}`))

test("generateCodeChallenge – is non-empty", () => {
    assert.ok(generateCodeChallenge(generateCodeVerifier()).length > 0)
})

test("generateCodeChallenge – properties", () => {
    const verifier = "fixed-verifier-string"
    assert.equal(generateCodeChallenge(verifier), generateCodeChallenge(verifier), "deterministic")
    assert.notEqual(generateCodeChallenge(generateCodeVerifier()), generateCodeChallenge(generateCodeVerifier()), "differs for different verifiers")

    const challenge = generateCodeChallenge(generateCodeVerifier())
    assert.match(challenge, /^[A-Za-z0-9\-_]+$/, "valid base64url")
    assert.ok(!challenge.includes("="), "no padding")
})
