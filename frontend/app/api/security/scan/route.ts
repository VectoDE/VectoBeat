import crypto from "crypto"
import { TextDecoder } from "util"
import { NextRequest, NextResponse } from "next/server"
import { fileTypeFromBuffer } from "file-type"

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024 // 15MB cap
const BLOCKED_MIME = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-msi",
  "application/java-archive",
  "application/x-bat",
  "application/x-sh",
  "application/x-elf",
  "application/vnd.ms-cab-compressed",
])

const BLOCKED_EXTENSIONS = new Set(["exe", "bat", "cmd", "com", "jar", "msi", "scr", "ps1", "vbs", "apk"])

const containsCurlPipe = (input: string): boolean => {
  const lower = input.toLowerCase()

  const curlIndex = lower.indexOf("curl ")
  if (curlIndex === -1) return false

  const pipeIndex = lower.indexOf("|", curlIndex)
  return pipeIndex !== -1
}

const SUSPICIOUS_PATTERNS: Array<
  RegExp | ((input: string) => boolean)
> = [
    /powershell/i,
    /Invoke-WebRequest/i,
    /cmd\.exe/i,
    /<script/i,
    /document\.write/i,
    /eval\(/i,
    /WScript\.Shell/i,
    /AutoOpen/i,
    /vbaProject/i,
    /base64,/i,
    /chmod\s+\+x/i,
    containsCurlPipe,
  ]

const TEXTUAL_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript", "application/x-sh"]
const TEXTUAL_EXTENSIONS = new Set(["txt", "json", "xml", "csv", "md", "yaml", "yml", "js", "ts", "sh", "py", "rb", "lua"])

const looksLikeTextBuffer = (buffer: Buffer) => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue
    if (byte >= 32 && byte <= 126) continue
    suspicious++
  }
  return suspicious / sample.length < 0.1
}

const extractTextPreview = (buffer: Buffer) => {
  const slice = buffer.subarray(0, Math.min(buffer.length, 4000))
  const decoder = new TextDecoder("utf-8", { fatal: false })
  return decoder.decode(slice)
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const file = form.get("file")
  const fileName = form.get("name")?.toString() ?? "upload.bin"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File payload missing." }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (!buffer.length) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 })
  }

  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File exceeds 15MB limit." }, { status: 413 })
  }

  const detected = await fileTypeFromBuffer(buffer)
  const resolvedMime = detected?.mime || file.type || "application/octet-stream"
  const resolvedExt = detected?.ext || fileName.split(".").pop()?.toLowerCase() || "bin"
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex")

  const warnings: string[] = []
  let severity: "clean" | "warning" | "blocked" = "clean"
  let reason: string | undefined

  if (BLOCKED_MIME.has(resolvedMime) || BLOCKED_EXTENSIONS.has(resolvedExt)) {
    severity = "blocked"
    reason = `Attachments of type ${resolvedExt.toUpperCase()} are not allowed.`
  }

  const mismatchedType = file.type && detected?.mime && file.type !== detected.mime
  if (mismatchedType) {
    warnings.push(`MIME mismatch: reported ${file.type} but detected ${detected?.mime}.`)
    if (severity === "clean") severity = "warning"
  }

  if (buffer.slice(0, 2).toString("utf-8") === "MZ") {
    severity = "blocked"
    reason = "Executable binaries are blocked."
  }

  if (buffer.includes(Buffer.from("vbaProject.bin"))) {
    severity = "blocked"
    reason = "Office macro payloads are not allowed."
  }

  const maybeText =
    TEXTUAL_MIME_PREFIXES.some((prefix) => resolvedMime.startsWith(prefix)) ||
    TEXTUAL_EXTENSIONS.has(resolvedExt) ||
    looksLikeTextBuffer(buffer)

  let textPreview: string | null = null
  if (maybeText) {
    textPreview = extractTextPreview(buffer)
    const lowered = textPreview.toLowerCase()
    for (const pattern of SUSPICIOUS_PATTERNS) {
      const matched =
        pattern instanceof RegExp
          ? pattern.test(textPreview)
          : pattern(textPreview)

      if (matched) {
        warnings.push(
          `Suspicious signature detected: ${pattern instanceof RegExp ? pattern.source : "curl pipe execution"
          }`
        )
        if (severity === "clean") severity = "warning"
      }
    }
    if (lowered.includes("-----begin rsa private key-----")) {
      severity = "blocked"
      reason = "Private key material cannot be uploaded."
    }
  }

  if (resolvedMime === "application/zip" && buffer.includes(Buffer.from("PK", "utf-8"))) {
    warnings.push("Compressed archives receive extra screening—only attach if necessary.")
    if (severity === "clean") severity = "warning"
  }

  const payload = {
    allowed: severity !== "blocked",
    severity,
    reason,
    mime: resolvedMime,
    extension: resolvedExt,
    sha256,
    warnings,
    textPreview,
  }

  if (!payload.allowed) {
    return NextResponse.json(payload, { status: 400 })
  }

  return NextResponse.json(payload)
}
