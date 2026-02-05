
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestForUser } from "@/lib/auth";
import { getUserRole, getPrismaClient, handlePrismaError } from "@/lib/db";
import { verifyPluginSource } from "@/lib/plugin-verifier";
import { PluginLanguage, VerificationStatus } from "@prisma/client";
import { z } from "zod";

const prisma = getPrismaClient();

// Schema for form fields (excluding file which is handled separately)
const uploadSchema = z.object({
  name: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with dashes/underscores"),
  description: z.string().max(500).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semantic (e.g. 1.0.0)").default("1.0.0"),
  author: z.string().max(50).default("Unknown"),
  price: z.coerce.number().min(0).default(0),
  language: z.nativeEnum(PluginLanguage),
  requiresDedicatedShard: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function POST(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  try {
    const discordId = request.nextUrl.searchParams.get("discordId");
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 });
    }

    // 1. Authentication & Authorization
    const auth = await verifyRequestForUser(request, discordId);
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const role = await getUserRole(discordId);
    if (!["admin", "developer", "operator"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // 2. Form Data Parsing
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 3. Validation
    const parseResult = uploadSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      version: formData.get("version"),
      author: formData.get("author"),
      price: formData.get("price"),
      language: formData.get("language"),
      requiresDedicatedShard: formData.get("requiresDedicatedShard"),
    });

    if (!parseResult.success) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: parseResult.error.flatten() 
      }, { status: 400 });
    }

    const { name, description, version, author, price, language, requiresDedicatedShard } = parseResult.data;

    // 4. File Content Verification
    let content: string;
    try {
      content = await file.text();
    } catch (e) {
      return NextResponse.json({ error: "Failed to read file content" }, { status: 400 });
    }

    const { status, issues } = await verifyPluginSource(language, content);

    if (status === VerificationStatus.REJECTED) {
      return NextResponse.json({ 
        success: false, 
        error: "Plugin verification failed", 
        issues 
      }, { status: 400 });
    }

    // 5. Database Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check for name collision
      const existing = await tx.plugin.findFirst({ where: { name } });
      if (existing) {
        throw new Error(`Plugin with name '${name}' already exists.`);
      }

      const plugin = await tx.plugin.create({
        data: {
          name,
          description: description || "",
          version,
          author,
          price,
          verificationStatus: status,
          requiresDedicatedShard,
          enabled: true,
          sources: {
            create: {
              language,
              filename: file.name,
              content,
              entryPoint: true
            }
          }
        },
        include: { sources: true }
      });
      return plugin;
    });

    return NextResponse.json({ 
      success: true, 
      plugin: {
        id: result.id,
        name: result.name,
        version: result.version,
        status: result.verificationStatus
      },
      issues 
    });

  } catch (error: any) {
    if (error.message && error.message.includes("already exists")) {
       return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Plugin upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
