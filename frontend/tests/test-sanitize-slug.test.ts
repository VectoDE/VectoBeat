/**
 * sanitizeSlug – unit tests.
 *
 * This function was the root cause of blog posts returning 404: the page
 * render was not applying sanitizeSlug before looking up posts in the DB.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeSlug } from "@/lib/utils"

const cases = [
    ["lowercases the input", "Hello-World", "hello-world"],
    ["replaces spaces with hyphens", "my blog post", "my-blog-post"],
    ["strips leading hyphens", "-leading", "leading"],
    ["strips trailing hyphens", "trailing-", "trailing"],
    ["collapses multiple hyphens into one", "a---b", "a-b"],
    ["removes special characters", "hello!@#world", "hello-world"],
    ["handles empty string", "", ""],
    ["handles already valid slug unchanged", "hello-world-123", "hello-world-123"],
    ["handles uppercase letters", "VectoBeat", "vectobeat"],
    ["preserves numbers", "post-123", "post-123"],
]

for (const [desc, input, expected] of cases) {
    test(`sanitizeSlug – ${desc}`, () => {
        assert.equal(sanitizeSlug(input), expected)
    })
}

test("sanitizeSlug – handles unicode / non-ascii chars", () => {
    const result = sanitizeSlug("über-cool")
    assert.ok(!result.includes("ü"), `Expected no unicode chars in: ${result}`)
})

test("sanitizeSlug – handles only special characters", () => {
    const result = sanitizeSlug("!!!###")
    assert.ok(result === "" || /^-*$/.test(result))
})
