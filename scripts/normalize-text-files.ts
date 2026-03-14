import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const showHelp = args.has("--help") || args.has("-h");
const rootDir = process.cwd();

const excludedPrefixes = [
  ".git/",
  "node_modules/",
  "website/node_modules/",
  "build/",
  "dist/",
  "website/dist/",
  "scripts/web/",
];

if (showHelp) {
  console.log("Usage: tsx scripts/normalize-lf.ts [--check]");
  console.log("  --check   Report CRLF, UTF-8 BOM, and invalid UTF-8 files without modifying them");
  process.exit(0);
}

function shouldSkip(relativePath: string): boolean {
  return excludedPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function listFilesFromGit(): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !shouldSkip(file));
}

function listFilesFromWalk(currentDir: string, baseDir = currentDir): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, "/");

    if (shouldSkip(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      result.push(...listFilesFromWalk(absolutePath, baseDir));
      continue;
    }
    if (entry.isFile()) {
      result.push(relativePath);
    }
  }
  return result;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8000);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function hasUtf8Bom(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function hasCrLf(buffer: Buffer): boolean {
  for (let index = 0; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      return true;
    }
  }
  return false;
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function normalizeCrLfToLf(buffer: Buffer): Buffer {
  const bytes: number[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      continue;
    }
    bytes.push(buffer[index]);
  }
  return Buffer.from(bytes);
}

function stripUtf8Bom(buffer: Buffer): Buffer {
  return hasUtf8Bom(buffer) ? buffer.subarray(3) : buffer;
}

function listProjectFiles(): string[] {
  try {
    return listFilesFromGit();
  } catch {
    return listFilesFromWalk(rootDir);
  }
}

const files = listProjectFiles();
const crlfFiles: string[] = [];
const bomFiles: string[] = [];
const invalidUtf8Files: string[] = [];
let normalizedCount = 0;

for (const relativePath of files) {
  const absolutePath = path.join(rootDir, relativePath);
  const buffer = fs.readFileSync(absolutePath);

  if (isProbablyBinary(buffer)) {
    continue;
  }

  const fileHasCrLf = hasCrLf(buffer);
  const fileHasBom = hasUtf8Bom(buffer);
  const utf8Buffer = stripUtf8Bom(buffer);
  const fileIsValidUtf8 = isValidUtf8(utf8Buffer);

  if (!fileIsValidUtf8) {
    invalidUtf8Files.push(relativePath);
    continue;
  }

  if (fileHasCrLf) {
    crlfFiles.push(relativePath);
  }
  if (fileHasBom) {
    bomFiles.push(relativePath);
  }

  if (!fileHasCrLf && !fileHasBom) {
    continue;
  }

  if (checkOnly) {
    continue;
  }

  let normalizedBuffer = stripUtf8Bom(buffer);
  normalizedBuffer = normalizeCrLfToLf(normalizedBuffer);
  fs.writeFileSync(absolutePath, normalizedBuffer);
  normalizedCount += 1;
}

const hasIssues = crlfFiles.length > 0 || bomFiles.length > 0 || invalidUtf8Files.length > 0;

if (!hasIssues) {
  console.log("All scanned text files already use LF without UTF-8 BOM, and no invalid UTF-8 was detected.");
  process.exit(0);
}

if (crlfFiles.length > 0) {
  console.log("Files with CRLF line endings:");
  for (const file of crlfFiles) {
    console.log(file);
  }
}

if (bomFiles.length > 0) {
  console.log("Files with UTF-8 BOM:");
  for (const file of bomFiles) {
    console.log(file);
  }
}

if (invalidUtf8Files.length > 0) {
  console.log("Files skipped because they are not valid UTF-8:");
  for (const file of invalidUtf8Files) {
    console.log(file);
  }
}

if (checkOnly) {
  console.error(
    `Found ${crlfFiles.length} file(s) with CRLF, ${bomFiles.length} file(s) with UTF-8 BOM, and ${invalidUtf8Files.length} file(s) that are not valid UTF-8.`,
  );
  process.exit(1);
}

console.log(`Normalized ${normalizedCount} file(s) to LF and removed UTF-8 BOM where needed.`);
if (invalidUtf8Files.length > 0) {
  process.exitCode = 1;
}
