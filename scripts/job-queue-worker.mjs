#!/usr/bin/env node

/**
 * Redis-backed queue worker to process analytics exports and embed override propagation.
 * This script shows how to bootstrap BullMQ-compatible queues. Deploy as a separate process.
 */

import { Worker, QueueEvents } from "bullmq"
import fetch from "node-fetch"
import { spawn } from "child_process"

const connection = { connection: { url: process.env.QUEUE_REDIS_URL || "redis://localhost:6379/0" } }
const namespace = process.env.QUEUE_NAMESPACE || "vectobeat"
const maxAttempts = Number(process.env.QUEUE_MAX_ATTEMPTS || "5")

const enqueueTelemetry = (job, state, error) => {
  const payload = {
    jobId: job.id,
    queue: job.queueName,
    state,
    error: error ? String(error) : null,
    correlationId: job.data?.correlationId,
    createdAt: job.timestamp,
    finishedAt: Date.now(),
  }
  if (process.env.QUEUE_DLQ_WEBHOOK && state === "failed" && job.attemptsMade >= maxAttempts) {
    fetch(process.env.QUEUE_DLQ_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } else {
    console.log("[queue-worker]", payload)
  }
}

const analyticsWorker = new Worker(
  `${namespace}:analytics-export`,
  async (job) => {
    const script = new URL("./compliance-export-job.mjs", import.meta.url)
    await new Promise((resolve, reject) => {
      const child = spawn("node", [script.pathname], {
        env: {
          ...process.env,
          COMPLIANCE_EXPORT_TYPES: "queue,moderation,billing",
          COMPLIANCE_EXPORT_GUILD_ID: job.data.guildId,
          COMPLIANCE_EXPORT_DISCORD_ID: job.data.actorId,
        },
        stdio: "inherit",
      })
      child.on("error", reject)
      child.on("exit", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Compliance export job failed with status ${code}`))
        }
      })
    })
  },
  { ...connection, concurrency: Number(process.env.QUEUE_CONCURRENCY_ANALYTICS || "1") },
)

const embedWorker = new Worker(
  `${namespace}:embed-overrides`,
  async (job) => {
    const response = await fetch(`${process.env.COMPLIANCE_EXPORT_BASE_URL}/api/bot/server-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.COMPLIANCE_EXPORT_BEARER}`,
      },
      body: JSON.stringify({ guildId: job.data.guildId, discordId: job.data.actorId }),
    })
    if (!response.ok) {
      throw new Error(`Embed propagation failed (${response.status})`)
    }
  },
  { ...connection, concurrency: Number(process.env.QUEUE_CONCURRENCY_EMBED || "2") },
)

for (const worker of [analyticsWorker, embedWorker]) {
  worker.on("completed", (job) => enqueueTelemetry(job, "completed"))
  worker.on("failed", (job, err) => enqueueTelemetry(job, "failed", err))
}

const events = new QueueEvents(`${namespace}:analytics-export`, connection)
events.on("failed", ({ jobId, failedReason }) => {
  console.warn(`[queue-worker] analytics job ${jobId} failed: ${failedReason}`)
})
