#!/usr/bin/env node

/**
 * Scheduled/on-demand compliance export job.
 *
 * Fetches queue/moderation/billing exports from the control panel API,
 * encrypts them with AES-256-GCM, writes them to disk, and optionally
 * uploads to S3 or SFTP with at-rest encryption.
 */

import fs from "fs/promises"
import path from "path"
import os from "os"
import crypto from "crypto"
import { execFile } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const REQUIRED_ENV = [
  "COMPLIANCE_EXPORT_BASE_URL",
  "COMPLIANCE_EXPORT_BEARER",
  "COMPLIANCE_EXPORT_GUILD_ID",
  "COMPLIANCE_EXPORT_DISCORD_ID",
  "COMPLIANCE_ENCRYPTION_KEY",
]

const missing = REQUIRED_ENV.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`[compliance-export] Missing required env vars: ${missing.join(", ")}`)
  process.exit(1)
}

const DELIVERY_MODE = (process.env.COMPLIANCE_DELIVERY_MODE || "local").toLowerCase()
const EXPORT_TYPES =
  process.env.COMPLIANCE_EXPORT_TYPES?.split(",").map((value) => value.trim()).filter(Boolean) ??
  ["queue", "moderation", "billing"]
const EXPORT_FORMAT = process.env.COMPLIANCE_EXPORT_FORMAT?.toLowerCase() === "csv" ? "csv" : "jsonl"
const BASE_URL = process.env.COMPLIANCE_EXPORT_BASE_URL.replace(/\/$/, "")
const AUTH_TOKEN = process.env.COMPLIANCE_EXPORT_BEARER
const GUILD_ID = process.env.COMPLIANCE_EXPORT_GUILD_ID
const DISCORD_ID = process.env.COMPLIANCE_EXPORT_DISCORD_ID
const OUTPUT_ROOT = process.env.COMPLIANCE_EXPORT_OUTPUT || path.join(__dirname, "..", "compliance-exports")

const keyBuffer = (() => {
  const raw = process.env.COMPLIANCE_ENCRYPTION_KEY.trim()
  let buffer: Buffer | null = null
  try {
    buffer = Buffer.from(raw, "base64")
  } catch {
    buffer = null
  }
  if (!buffer || buffer.length !== 32) {
    const hex = Buffer.from(raw, "hex")
    if (hex.length !== 32) {
      console.error("[compliance-export] COMPLIANCE_ENCRYPTION_KEY must be 32-byte base64 or hex string.")
      process.exit(1)
    }
    buffer = hex
  }
  return buffer
})()

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

const encryptBuffer = (buffer: Buffer) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  }
}

const execCommand = async (command: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  new Promise<void>((resolve, reject) => {
    const child = execFile(command, args, { env, stdio: "inherit" }, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
    child.on("error", reject)
  })

const uploadToS3 = async (filePath: string, keyName: string) => {
  const bucket = process.env.COMPLIANCE_S3_BUCKET
  const region = process.env.COMPLIANCE_S3_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  if (!bucket || !region) {
    throw new Error("COMPLIANCE_S3_BUCKET and COMPLIANCE_S3_REGION are required for S3 delivery.")
  }
  const prefix = process.env.COMPLIANCE_S3_PREFIX || ""
  const target = `s3://${bucket}/${[prefix, keyName].filter(Boolean).join("/")}`
  await execCommand(
    "aws",
    ["s3", "cp", filePath, target, "--sse", "AES256"],
    { ...process.env, AWS_DEFAULT_REGION: region, AWS_REGION: region },
  )
}

const uploadToSftp = async (filePath: string, remoteKey: string) => {
  const host = process.env.COMPLIANCE_SFTP_HOST
  const user = process.env.COMPLIANCE_SFTP_USER
  const port = process.env.COMPLIANCE_SFTP_PORT || "22"
  const identityFile = process.env.COMPLIANCE_SFTP_IDENTITY_FILE
  const remoteDir = process.env.COMPLIANCE_SFTP_PATH || "/uploads"
  if (!host || !user || !identityFile) {
    throw new Error(
      "COMPLIANCE_SFTP_HOST, COMPLIANCE_SFTP_USER, and COMPLIANCE_SFTP_IDENTITY_FILE are required for SFTP delivery.",
    )
  }
  const batchFile = path.join(os.tmpdir(), `sftp-batch-${Date.now()}.txt`)
  const remotePath = `${remoteDir.replace(/\/$/, "")}/${remoteKey}`
  await fs.writeFile(batchFile, `put "${filePath}" "${remotePath}"\n`)
  try {
    await execCommand("sftp", ["-i", identityFile, "-o", "StrictHostKeyChecking=yes", "-P", port, "-b", batchFile, `${user}@${host}`])
  } finally {
    await fs.unlink(batchFile).catch(() => {})
  }
}

const fetchExport = async (type: string) => {
  const params = new URLSearchParams({
    guildId: GUILD_ID,
    discordId: DISCORD_ID,
    type,
    format: EXPORT_FORMAT,
  })
  const response = await fetch(`${BASE_URL}/api/control-panel/compliance/export?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Export fetch failed (${type}): ${response.status} ${body}`)
  }
  return Buffer.from(await response.text(), "utf-8")
}

const run = async () => {
  const createdAt = new Date().toISOString()
  await ensureDir(OUTPUT_ROOT)
  const guildDir = path.join(OUTPUT_ROOT, GUILD_ID)
  await ensureDir(guildDir)
  for (const type of EXPORT_TYPES) {
    try {
      console.log(`[compliance-export] Fetching ${type} export…`)
      const raw = await fetchExport(type)
      const encrypted = encryptBuffer(raw)
      const fileName = `${createdAt.replace(/[:.]/g, "-")}-${type}.${EXPORT_FORMAT}.enc.json`
      const payload = {
        version: 1,
        guildId: GUILD_ID,
        type,
        format: EXPORT_FORMAT,
        createdAt,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        ciphertext: encrypted.ciphertext,
      }
      const filePath = path.join(guildDir, fileName)
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2))
      console.log(`[compliance-export] Wrote encrypted export to ${filePath}`)

      if (DELIVERY_MODE === "s3") {
        await uploadToS3(filePath, `${GUILD_ID}/${fileName}`)
        console.log(`[compliance-export] Uploaded to S3 (${fileName}).`)
      } else if (DELIVERY_MODE === "sftp") {
        await uploadToSftp(filePath, fileName)
        console.log(`[compliance-export] Uploaded via SFTP (${fileName}).`)
      } else {
        console.log("[compliance-export] Delivery mode set to local; skipping upload.")
      }
    } catch (error) {
      console.error(`[compliance-export] Failed to process export ${type}:`, error)
      if (process.env.COMPLIANCE_EXIT_ON_FAILURE === "true") {
        process.exitCode = 1
      }
    }
  }
}

run()
