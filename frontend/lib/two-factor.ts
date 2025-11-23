import { authenticator } from "otplib"

authenticator.options = {
  step: 30,
  window: 1,
}

export const generateTwoFactorSecret = (label: string, issuer = "VectoBeat") => {
  const secret = authenticator.generateSecret()
  const otpauth = authenticator.keyuri(label, issuer, secret)
  return { secret, otpauth }
}

export const verifyTwoFactorToken = (secret: string, token: string) => {
  try {
    return authenticator.check(token, secret)
  } catch (error) {
    console.error("[VectoBeat] 2FA verification failed:", error)
    return false
  }
}
