import crypto from "crypto"

const keyMaterial = process.env.DATA_ENCRYPTION_KEY
  ? crypto.createHash("sha256").update(process.env.DATA_ENCRYPTION_KEY).digest()
  : null

export const isEncryptionAvailable = Boolean(keyMaterial)

const encryptBuffer = (value: Buffer) => {
  if (!keyMaterial) {
    return null
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial, iv)

  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]).toString("base64")
  const authTag = cipher.getAuthTag().toString("base64")

  return {
    payload: encrypted,
    iv: iv.toString("base64"),
    tag: authTag,
  }
}

const decryptBuffer = (payload: string, iv: string, tag: string) => {
  if (!keyMaterial) {
    return null
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial, Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()])
    return decrypted
  } catch {
    return null
  }
}

export const encryptJson = (payload: unknown) => {
  const serialized = Buffer.from(JSON.stringify(payload), "utf8")
  return encryptBuffer(serialized)
}

export const decryptJson = <T>(data: { payload: string; iv: string; tag: string }): T | null => {
  const decrypted = decryptBuffer(data.payload, data.iv, data.tag)
  if (!decrypted) return null
  try {
    return JSON.parse(decrypted.toString("utf8"))
  } catch {
    return null
  }
}

export const encryptText = (text: string) => encryptBuffer(Buffer.from(text, "utf8"))

export const decryptText = (data: { payload: string; iv: string; tag: string }) => {
  const decrypted = decryptBuffer(data.payload, data.iv, data.tag)
  return decrypted ? decrypted.toString("utf8") : null
}
