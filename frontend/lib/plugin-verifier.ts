
import { PluginLanguage, VerificationStatus } from "@prisma/client";

export interface VerificationResult {
  status: VerificationStatus;
  issues: string[];
}

// Regex patterns for potentially dangerous operations
const PATTERNS = {
  [PluginLanguage.PYTHON]: [
    { pattern: /\bos\.system\b/, message: "Usage of os.system is prohibited." },
    { pattern: /\bsubprocess\./, message: "Usage of subprocess module is prohibited." },
    { pattern: /\beval\s*\(/, message: "Usage of eval() is prohibited." },
    { pattern: /\bexec\s*\(/, message: "Usage of exec() is prohibited." },
    { pattern: /__import__\s*\(/, message: "Dynamic imports via __import__ are prohibited." },
    { pattern: /\bopen\s*\(/, message: "Direct file access via open() is restricted." },
    { pattern: /\bsocket\./, message: "Direct socket usage is restricted." },
  ],
  [PluginLanguage.JAVASCRIPT]: [
    { pattern: /\beval\s*\(/, message: "Usage of eval() is prohibited." },
    { pattern: /\bchild_process\b/, message: "Usage of child_process is prohibited." },
    { pattern: /\bfs\./, message: "Direct file system access (fs module) is restricted." },
    { pattern: /\bexec\s*\(/, message: "Usage of exec() is prohibited." },
    { pattern: /\bspawn\s*\(/, message: "Usage of spawn() is prohibited." },
    { pattern: /\bFunction\s*\(/, message: "Dynamic function creation is prohibited." },
  ],
  [PluginLanguage.TYPESCRIPT]: [
    { pattern: /\beval\s*\(/, message: "Usage of eval() is prohibited." },
    { pattern: /\bchild_process\b/, message: "Usage of child_process is prohibited." },
    { pattern: /\bfs\./, message: "Direct file system access (fs module) is restricted." },
    { pattern: /\bexec\s*\(/, message: "Usage of exec() is prohibited." },
    { pattern: /\bspawn\s*\(/, message: "Usage of spawn() is prohibited." },
    { pattern: /\bFunction\s*\(/, message: "Dynamic function creation is prohibited." },
  ],
  [PluginLanguage.LUA]: [
    { pattern: /\bos\.execute\b/, message: "Usage of os.execute is prohibited." },
    { pattern: /\bio\.open\b/, message: "Usage of io.open is prohibited." },
    { pattern: /\bdofile\b/, message: "Usage of dofile is prohibited." },
    { pattern: /\bloadfile\b/, message: "Usage of loadfile is prohibited." },
    { pattern: /\bdebug\./, message: "Usage of debug library is prohibited." },
  ],
};

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB

export async function verifyPluginSource(
  language: PluginLanguage,
  content: string
): Promise<VerificationResult> {
  const issues: string[] = [];
  const rules = PATTERNS[language] || [];

  // 1. Static Analysis via Regex
  for (const rule of rules) {
    if (rule.pattern.test(content)) {
      issues.push(rule.message);
    }
  }

  // 2. Length Check
  if (content.length > MAX_FILE_SIZE_BYTES) {
    issues.push(`File size exceeds limit (${MAX_FILE_SIZE_BYTES / 1024}KB).`);
  }

  // 3. Entry Point Check (Basic heuristic)
  if (language === PluginLanguage.PYTHON && !content.includes("def run(")) {
    issues.push("Missing 'def run(context):' entry point.");
  }

  if (issues.length > 0) {
    return { status: VerificationStatus.REJECTED, issues };
  }

  return { status: VerificationStatus.VERIFIED, issues: [] };
}
