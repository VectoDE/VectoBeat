"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"

function TwoFactorSetupContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const modeParam = (searchParams?.get("mode") || "verify").toLowerCase()
  const contextParam = (searchParams?.get("context") || "login").toLowerCase()
  const isSetupMode = modeParam === "setup"
  const showCodeInput = isSetupMode || contextParam === "login"
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauth, setOtpauth] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "verifying">("idle")

  useEffect(() => {
    // Capture session params from URL if present (e.g. from login callback)
    const urlToken = searchParams?.get("token")
    const urlUserId = searchParams?.get("user_id")
    
    if (urlToken) {
      localStorage.setItem("discord_token", urlToken)
    }
    if (urlUserId) {
      localStorage.setItem("discord_user_id", urlUserId)
    }
    
    if (urlToken || urlUserId) {
      // Clean up the URL to hide the token/user_id
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete("token")
      newUrl.searchParams.delete("user_id")
      window.history.replaceState({}, "", newUrl.toString())
    }

    const discordId = localStorage.getItem("discord_user_id") || urlUserId
    const username = searchParams?.get("username") || ""
    if (!discordId) {
      router.push("/")
      return
    }

    if (!isSetupMode) {
      setSecret(null)
      setOtpauth(null)
      return
    }

    const loadSecret = async () => {
      const response = await fetch(
        `/api/account/security/setup?discordId=${discordId}&username=${encodeURIComponent(username)}`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        const payload = await response.json()
        setError(payload.error || "Failed to prepare 2FA setup.")
        return
      }
      const data = await response.json()
      setSecret(data.secret)
      setOtpauth(data.otpauth)
    }

    loadSecret()
  }, [router, searchParams, isSetupMode])

  const handleVerify = async () => {
    setError(null)
    if (!code || code.length < 6) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }

    const discordId = localStorage.getItem("discord_user_id")
    if (!discordId) {
      router.push("/")
      return
    }

    setStatus("verifying")
    try {
      const endpoint = isSetupMode ? "/api/account/security/verify" : "/api/account/security/challenge"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, token: code }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify code.")
      }
      localStorage.setItem(`two_factor_verified_${discordId}`, Date.now().toString())
      router.push("/control-panel")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.")
    } finally {
      setStatus("idle")
    }
  }

  const qrImage = otpauth
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpauth)}&size=220x220`
    : null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <div className="flex-1 w-full pt-24 pb-12 px-4">
        <div className="max-w-3xl mx-auto bg-card/50 border border-border/50 rounded-xl p-8">
          <h1 className="text-3xl font-bold mb-2">
            {isSetupMode ? "Set up Two-Factor Authentication" : "Two-Factor Challenge"}
          </h1>
          <p className="text-foreground/70 mb-8">
            {isSetupMode
              ? "Secure your account by linking VectoBeat to an authenticator app. Scan the QR code or use the secret key below, then enter the 6-digit code to finish setup."
              : "Enter the code from your authenticator app to complete this login. This keeps your VectoBeat session secure."}
          </p>

          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          {isSetupMode ? (
            !secret ? (
              <p className="text-sm text-foreground/60">Preparing your 2FA secret...</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="flex flex-col items-center p-4 bg-card rounded-lg border border-border/40">
                  {qrImage ? (
                    <Image src={qrImage} alt="2FA QR" width={220} height={220} className="w-48 h-48" unoptimized />
                  ) : (
                    <p className="text-sm text-foreground/60">QR code unavailable</p>
                  )}
                  <p className="mt-3 text-xs text-foreground/60 text-center">
                    Scan with Google Authenticator, Authy, or 1Password
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">Secret Key</p>
                    <code className="block w-full bg-background border border-border rounded-lg p-3 text-sm break-all">
                      {secret}
                    </code>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="mb-8 rounded-lg border border-border/40 bg-card/40 p-4">
              <p className="text-sm text-foreground/70">
                Two-factor authentication is enabled on your account. Enter the current code from your authenticator app to
                continue logging in.
              </p>
            </div>
          )}

          {showCodeInput ? (
            <div className="space-y-4 mb-8">
              <div>
                <p className="text-sm font-semibold mb-2">Enter Verification Code</p>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:border-primary/50 focus:outline-none tracking-widest text-center text-lg"
                  inputMode="numeric"
                  placeholder="000000"
                />
              </div>
              <button
                onClick={handleVerify}
                disabled={status === "verifying"}
                className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-60"
              >
                {status === "verifying"
                  ? "Verifying..."
                  : isSetupMode
                    ? "Verify & Enable 2FA"
                    : "Verify & Continue"}
              </button>
            </div>
          ) : (
            <div className="mb-8 rounded-lg border border-border/40 bg-card/40 p-4">
              <p className="text-sm text-foreground/70">
                This session is already verified. Return to your previous screen to continue.
              </p>
            </div>
          )}

          <p className="text-xs text-foreground/60">
            Lost access to your authenticator? Contact support with your Discord ID to reset two-factor authentication.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default function TwoFactorSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-foreground/60">Preparing two-factor setup...</p>
          </div>
          <Footer />
        </div>
      }
    >
      <TwoFactorSetupContent />
    </Suspense>
  )
}
