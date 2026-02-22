/**
 * sanitizeSlug – unit tests.
 *
 * This function was the root cause of blog posts returning 404: the page
 * render was not applying sanitizeSlug before looking up posts in the DB.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeSlug } from "@/lib/utils"

test("sanitizeSlug – lowercases the input", () => {
    assert.equal(sanitizeSlug("Hello-World"), "hello-world")
})

test("sanitizeSlug – replaces spaces with hyphens", () => {
    assert.equal(sanitizeSlug("my blog post"), "my-blog-post")
})

test("sanitizeSlug – strips leading hyphens", () => {
    assert.equal(sanitizeSlug("-leading"), "leading")
})

test("sanitizeSlug – strips trailing hyphens", () => {
    assert.equal(sanitizeSlug("trailing-"), "trailing")
})

test("sanitizeSlug – collapses multiple hyphens into one", () => {
    assert.equal(sanitizeSlug("a---b"), "a-b")
})

test("sanitizeSlug – removes special characters", () => {
    assert.equal(sanitizeSlug("hello!@#world"), "hello-world")
})

test("sanitizeSlug – handles empty string", () => {
    assert.equal(sanitizeSlug(""), "")
})

test("sanitizeSlug – handles already valid slug unchanged", () => {
    assert.equal(sanitizeSlug("hello-world-123"), "hello-world-123")
})

test("sanitizeSlug – handles uppercase letters", () => {
    assert.equal(sanitizeSlug("VectoBeat"), "vectobeat")
})

test("sanitizeSlug – handles unicode / non-ascii chars", () => {
    // Non-ASCII chars become hyphens and get deduplicated
    const result = sanitizeSlug("über-cool")
    assert.ok(!result.includes("ü"), `Expected no unicode chars in: ${result}`)
})

test("sanitizeSlug – preserves numbers", () => {
    assert.equal(sanitizeSlug("post-123"), "post-123")
})

test("sanitizeSlug – handles only special characters", () => {
    const result = sanitizeSlug("!!!###")
    // Should be empty or only hyphens (stripped)
    assert.ok(result === "" || /^[-]*$/.test(result))
})
