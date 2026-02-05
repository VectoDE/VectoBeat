
import { type NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { getApiKeySecrets } from "@/lib/api-keys";
import { getPrismaClient } from "@/lib/db";

const prisma = getPrismaClient();

const AUTH_TOKEN_TYPES = ["control_panel", "server_settings"];

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false });
  // Add fallback for development/testing if needed via environment variables directly
  // But generally getApiKeySecrets handles env vars if configured.
  // We use the same header keys as server-settings for consistency
  return authorizeRequest(req, secrets, {
    allowLocalhost: true,
    headerKeys: ["authorization", "x-api-key", "x-server-settings-key"],
  });
}

export async function GET(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  try {
    // 1. Authentication
    const authorized = await isAuthorized(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const guildId = request.nextUrl.searchParams.get("guildId");
    if (!guildId) {
      return NextResponse.json({ error: "guildId is required" }, { status: 400 });
    }

    // 2. Fetch Plugins
    // We select specific fields to minimize data transfer
    const installations = await prisma.pluginInstallation.findMany({
      where: {
        guildId,
        enabled: true,
        plugin: {
          enabled: true,
          verificationStatus: "VERIFIED"
        }
      },
      select: {
        plugin: {
          select: {
            id: true,
            name: true,
            version: true,
            requiresDedicatedShard: true,
            sources: {
              select: {
                filename: true,
                language: true,
                content: true,
                entryPoint: true
              }
            }
          }
        }
      }
    });

    // 3. Transform Response
    const plugins = installations.map(inst => ({
      id: inst.plugin.id,
      name: inst.plugin.name,
      version: inst.plugin.version,
      requiresDedicatedShard: inst.plugin.requiresDedicatedShard,
      sources: inst.plugin.sources.map(s => ({
        filename: s.filename,
        language: s.language,
        content: s.content,
        entryPoint: s.entryPoint
      }))
    }));

    return NextResponse.json({ 
      plugins,
      meta: {
        count: plugins.length,
        guildId
      }
    }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60"
      }
    });

  } catch (error) {
    console.error("Bot plugin fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
