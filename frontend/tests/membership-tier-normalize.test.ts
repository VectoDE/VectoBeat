import test from "node:test"
import assert from "node:assert/strict"
import { normalizeTierId, isMembershipTier } from "../lib/memberships"

test("normalizeTierId coerces casing and trims whitespace", () => {
  assert.equal(normalizeTierId("Free"), "free")
  assert.equal(normalizeTierId("  starter "), "starter")
  assert.equal(normalizeTierId("PRO"), "pro")
  assert.equal(normalizeTierId("GrOwTh"), "growth")
  assert.equal(normalizeTierId("SCALE"), "scale")
})

test("normalizeTierId defaults unknown values to free", () => {
  assert.equal(normalizeTierId("enterpris"), "free")
  assert.equal(normalizeTierId(""), "free")
  assert.equal(normalizeTierId(null), "free")
  assert.equal(normalizeTierId(undefined), "free")
})

test("isMembershipTier recognises canonical ids", () => {
  assert.equal(isMembershipTier("starter"), true)
  assert.equal(isMembershipTier("Starter"), true)
  assert.equal(isMembershipTier("premium"), false)
  assert.equal(isMembershipTier(null), false)
})
