import { NextResponse } from "next/server"
import { getPrismaClient } from "@/lib/prisma"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get("domain")

  if (!domain) {
    return NextResponse.json({ error: "Missing domain parameter" }, { status: 400 })
  }

  const prisma = getPrismaClient()
  if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
  }

  try {
    // Real implementation: Look up EnterpriseSetting by domain
    const enterpriseConfig = await prisma.enterpriseSetting.findUnique({
      where: { domain }
    })

    if (enterpriseConfig && enterpriseConfig.ssoEnabled) {
      const config = enterpriseConfig.ssoConfig as Record<string, any> || {}
      
      // Safe to return public SSO config
      return NextResponse.json({
        sso_enabled: true,
        idp_url: config['idp_url'] || null,
        provider: enterpriseConfig.ssoProvider,
        branding: enterpriseConfig.branding
      })
    }

    return NextResponse.json({
      sso_enabled: false,
      message: "SSO not configured for this domain."
    }, { status: 404 })

  } catch (error) {
    console.error("SSO Discovery Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST() {
  // Handle SAML Assertion Consumer Service (ACS)
  return NextResponse.json({ error: "SSO ACS endpoint requires IDP configuration" }, { status: 501 })
}
