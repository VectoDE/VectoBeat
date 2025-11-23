import crypto from "crypto"

export const hashSessionToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex")
}
