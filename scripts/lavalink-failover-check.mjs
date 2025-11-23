#!/usr/bin/env node

/**
 * Poll Lavalink nodes for health, update Redis, and emit alarms.
 *
 * Expected env vars:
 * - LAVALINK_NODES="us-east:node-a:https://node-a.example.com/metrics,eu-central:node-b:https://node-b.example.com/metrics"
 * - LAVALINK_HEALTH_WEBHOOK="https://hooks.slack.com/services/..."
 * - QUEUE_REDIS_URL="redis://localhost:6379/0"
 */

import fetch from "node-fetch"
import { createClient } from "redis"

const nodes = (process.env.LAVALINK_NODES || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [region, name, url] = entry.split(":")
    if (!region || !name || !url) {
      throw new Error(`Invalid LAVALINK_NODES entry: ${entry}`)
    }
    return { region, name, url }
  })

if (nodes.length === 0) {
  console.error("[failover-check] No nodes configured. Set LAVALINK_NODES.")
  process.exit(1)
}

const redisUrl = process.env.QUEUE_REDIS_URL || "redis://localhost:6379/0"
const redis = createClient({ url: redisUrl })
await redis.connect()

const webhook = process.env.LAVALINK_HEALTH_WEBHOOK
const timeoutMs = Number(process.env.LAVALINK_HEALTH_TIMEOUT || "5000")

const checkNode = async (node) => {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(node.url, { signal: controller.signal })
    clearTimeout(timeout)
    const latency = Date.now() - start
    const healthy = response.ok
    return { ...node, healthy, latency, status: response.status }
  } catch (error) {
    return { ...node, healthy: false, latency: Date.now() - start, status: error.name === "AbortError" ? "timeout" : "error" }
  }
}

const payloads = []
for (const node of nodes) {
  const result = await checkNode(node)
  payloads.push(result)
  const key = `lavalink:health:${node.region}:${node.name}`
  await redis.hSet(key, {
    region: node.region,
    name: node.name,
    healthy: result.healthy ? "1" : "0",
    latency: String(result.latency),
    status: String(result.status),
    checkedAt: new Date().toISOString(),
  })
  await redis.expire(key, Number(process.env.LAVALINK_HEALTH_TTL || "120"))
  const logLine = `[failover-check] ${node.region}/${node.name} healthy=${result.healthy} latency=${result.latency}ms status=${result.status}`
  if (!result.healthy) {
    console.error(logLine)
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: logLine }),
      }).catch(() => {})
    }
  } else {
    console.log(logLine)
  }
}

await redis.disconnect()

if (process.env.LAVALINK_HEALTH_SUMMARY_LOG === "true") {
  console.log(JSON.stringify(payloads, null, 2))
}
