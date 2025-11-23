import { defineConfig } from "@prisma/config"
import dotenv from "dotenv"
import path from "path"

// Load .env from the frontend directory so Prisma CLI sees DATABASE_URL.
dotenv.config({ path: path.resolve(__dirname, ".env") })

const fallbackUrl = "mysql://root:password@localhost:3306/vectobeat"
const datasourceUrl =
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
    ? process.env.DATABASE_URL.trim()
    : fallbackUrl

// Ensure Prisma CLI sees a URL even if the env is missing.
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  console.warn("[VectoBeat] DATABASE_URL is not set. Using fallback datasource URL for Prisma commands.")
  process.env.DATABASE_URL = datasourceUrl
}

export default defineConfig({
  engine: "classic",
  datasource: {
    url: datasourceUrl,
  },
})
