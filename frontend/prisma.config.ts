import { defineConfig } from "@prisma/config"
import dotenv from "dotenv"
import fs from "node:fs"
import path from "path"

const envCandidates = [".env", ".env.local", ".env.production"].map((file) => path.resolve(__dirname, file))
const isLocalishUrl = (url?: string) =>
  typeof url === "string" && /@(?:localhost|127\.0\.0\.1|mysql)(?::\d+)?\//i.test(url)

// Load env files without overriding explicit environment variables.
for (const envFile of envCandidates) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false })
  }
}

// Prefer a DATABASE_URL from env files when the current one is missing or still set to a local placeholder.
const fileDatasourceUrl = envCandidates
  .filter((envFile) => fs.existsSync(envFile))
  .map((envFile) => dotenv.parse(fs.readFileSync(envFile)).DATABASE_URL?.trim())
  .find((url) => url && url.length > 0)

let datasourceUrl = process.env.DATABASE_URL?.trim()

if ((!datasourceUrl || isLocalishUrl(datasourceUrl)) && fileDatasourceUrl) {
  datasourceUrl = fileDatasourceUrl
}

if (!datasourceUrl) {
  throw new Error(
    "[VectoBeat] DATABASE_URL is not configured. Set it in .env.production or via environment variables to avoid falling back to localhost."
  )
}

process.env.DATABASE_URL = datasourceUrl

export default defineConfig({
  engine: "classic",
  datasource: {
    url: datasourceUrl,
  },
})
