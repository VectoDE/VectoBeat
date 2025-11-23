import test from "node:test"
import assert from "node:assert/strict"
import { hasPlanAccess } from "@/app/api/external/queue/route"

test("queue snapshot API follows plan capabilities", () => {
  assert.equal(hasPlanAccess("free"), false)
  assert.equal(hasPlanAccess("starter"), true)
  assert.equal(hasPlanAccess("pro"), true)
  assert.equal(hasPlanAccess("growth"), true)
  assert.equal(hasPlanAccess("scale"), true)
  assert.equal(hasPlanAccess("enterprise"), true)
})
