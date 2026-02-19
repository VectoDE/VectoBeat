import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(__dirname, "..", "..");
const docsRoot = path.join(repoRoot, "docs");

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".venv",
  "venv",
  ".pytest_cache",
  "__pycache__",
  "logs",
  "tmp",
  "data",
  ".git-hooks",
]);

const gatherEnvFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      gatherEnvFiles(fullPath, acc);
    } else if (entry.name.startsWith(".env")) {
      acc.push(fullPath);
    }
  }
  return acc;
};

const parseEnvKeys = (filePath: string): Set<string> => {
  const content = fs.readFileSync(filePath, "utf8");
  const keys = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]!.trim())
    .filter(Boolean);
  return new Set(keys);
};

const collectRelativeLinks = (filePath: string, content: string): string[] => {
  const limited = content.length > 20000 ? content.slice(0, 20000) : content;
  const matches = [...limited.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return matches
    .map((m) => m[1]!)
    .filter(
      (href) =>
        href.startsWith("./") ||
        href.startsWith("../") ||
        href.startsWith("docs/"),
    );
};

test("env files are anchored to the repo root", () => {
  const envFiles = gatherEnvFiles(repoRoot);
  const allowedNames = [".env", ".env.example", ".env.development", ".env.production"];
  const allowedPaths = [
    ...allowedNames.map((name) => path.join(repoRoot, name)),
    path.join(repoRoot, "bot", ".env"),
    path.join(repoRoot, "frontend", ".env"),
    // Local overrides are allowed
    path.join(repoRoot, "bot", ".env.local"),
    path.join(repoRoot, "frontend", ".env.local"),
  ].filter((file) => fs.existsSync(file));

  assert.deepStrictEqual(
    envFiles.sort(),
    allowedPaths.sort(),
    `Unexpected .env-style files found: ${envFiles
      .filter((f) => !allowedPaths.includes(f))
      .join(", ")}`,
  );
});

test(".env.example stays in sync with the working .env", () => {
  const envPath = path.join(repoRoot, ".env");
  const examplePath = path.join(repoRoot, ".env.example");
  if (!fs.existsSync(envPath) || !fs.existsSync(examplePath)) {
    return;
  }
  const actualKeys = parseEnvKeys(envPath);
  const templateKeys = parseEnvKeys(examplePath);
  const missingInExample = [...actualKeys].filter(
    (key) => !templateKeys.has(key),
  );
  assert.deepStrictEqual(
    missingInExample,
    [],
    `Keys present in .env but not .env.example: ${missingInExample.join(", ")}`,
  );
});

test("docs index is present and links resolve", () => {
  const docsIndex = path.join(docsRoot, "README.md");
  assert.ok(fs.existsSync(docsIndex), "docs/README.md is missing");
  const content = fs.readFileSync(docsIndex, "utf8");
  ["Deployment", "Operations", "Troubleshooting"].forEach((heading) => {
    assert.ok(
      content.includes(heading),
      `docs/README.md should mention ${heading}`,
    );
  });

  const brokenLinks: string[] = [];
  for (const href of collectRelativeLinks(docsIndex, content)) {
    const [relativePath] = href.split("#");
    const resolved = path.resolve(path.dirname(docsIndex), relativePath);
    if (!fs.existsSync(resolved)) {
      brokenLinks.push(href);
    }
  }
  assert.deepStrictEqual(
    brokenLinks,
    [],
    `docs/README.md contains broken links: ${brokenLinks.join(", ")}`,
  );
});

test("README exposes public bot badges", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const expectedSnippets = [
    "Bot%20Invite-Add%20VectoBeat",
    "DiscordBotList-View%20Listing",
  ];
  for (const snippet of expectedSnippets) {
    assert.ok(
      readme.includes(snippet),
      `README is missing the badge snippet: ${snippet}`,
    );
  }
});
