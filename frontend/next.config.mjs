import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const planCapabilitiesAbsolute =
  [path.resolve(__dirname, "../plan-capabilities.json"), path.resolve(__dirname, "./plan-capabilities.json")].find(
    (candidate) => fs.existsSync(candidate)
  ) ??
  (() => {
    throw new Error("plan-capabilities.json is missing. Add it to the repository or Docker image.")
  })()

const planCapabilitiesData = JSON.parse(fs.readFileSync(planCapabilitiesAbsolute, "utf-8"))
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"))

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://m.stripe.network",
      "script-src-elem 'self' 'unsafe-inline' https://js.stripe.com https://m.stripe.network",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://discord.com https://api.stripe.com https://checkout.stripe.com https://m.stripe.network https://vectobeat.uplytech.de https://bot.vectobeat.uplytech.de https://45.84.196.19 http://45.84.196.19 https://45.84.196.19:3060 http://45.84.196.19:3060 wss://vectobeat.uplytech.de wss://bot.vectobeat.uplytech.de wss://45.84.196.19 wss://45.84.196.19:3060 ws://45.84.196.19 ws://45.84.196.19:3060 ws://localhost:* ws://127.0.0.1:*",
      "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
]

const nextConfig = {
  output: "standalone",
  typescript: {
    // ignoreBuildErrors: true, // Removed for type safety
  },
  images: {
    // unoptimized: true, // Removed for performance
  },
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_PLAN_CAPABILITIES: JSON.stringify(planCapabilitiesData),
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
