import { getSecurityHeaders } from "@/lib/security"

export async function GET() {
  return new Response("Security headers configured", {
    headers: getSecurityHeaders(),
  })
}
