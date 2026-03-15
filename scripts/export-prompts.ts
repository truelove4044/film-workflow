import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import knex from "knex";
import { buildPromptFileRecords } from "./prompt-file-utils";

interface PromptRow {
  id: number;
  code: string | null;
  name: string | null;
  type: string | null;
  customValue: string | null;
  defaultValue: string | null;
}

interface CliOptions {
  container: string;
  outDir: string;
}

interface ExportStats {
  total: number;
  success: number;
  empty: number;
  failed: number;
}

const CONTAINER_DB_PATH = "/app/db.sqlite";
const DEFAULT_CONTAINER = "toonflow-local";
const DEFAULT_OUTPUT_DIR = "backup/prompts";

function printHelp() {
  console.log(`Usage:
  tsx scripts/export-prompts.ts [--container <name>] [--outDir <path>]

Options:
  --container   Docker container name (default: ${DEFAULT_CONTAINER})
  --outDir      Output directory for markdown files (default: ${DEFAULT_OUTPUT_DIR})
  --help, -h    Show help
`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    container: DEFAULT_CONTAINER,
    outDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--container") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --container");
      options.container = value;
      index += 1;
      continue;
    }

    if (arg === "--outDir") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --outDir");
      options.outDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function copyDbFromContainer(container: string, tempDbPath: string) {
  execFileSync("docker", ["cp", `${container}:${CONTAINER_DB_PATH}`, tempDbPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function resolveEffectiveValue(customValue: string | null, defaultValue: string | null): string {
  const custom = typeof customValue === "string" ? customValue : "";
  if (custom.trim() !== "") {
    return custom;
  }
  return defaultValue ?? "";
}

async function loadPrompts(tempDbPath: string): Promise<PromptRow[]> {
  const db = knex({
    client: "sqlite3",
    connection: {
      filename: tempDbPath,
    },
    useNullAsDefault: true,
  });

  try {
    const rows = await db<PromptRow>("t_prompts")
      .select("id", "code", "name", "type", "customValue", "defaultValue")
      .orderBy("id", "asc");
    return rows;
  } finally {
    await db.destroy();
  }
}

function exportPrompts(rows: PromptRow[], outDir: string): ExportStats {
  const stats: ExportStats = {
    total: rows.length,
    success: 0,
    empty: 0,
    failed: 0,
  };
  const fileRecords = buildPromptFileRecords(rows);
  const rowById = new Map<number, PromptRow>(rows.map((row) => [row.id, row]));

  fs.mkdirSync(outDir, { recursive: true });

  for (const record of fileRecords) {
    try {
      const row = rowById.get(record.id);
      if (!row) throw new Error(`Prompt row not found by id: ${record.id}`);
      const effectiveValue = resolveEffectiveValue(row.customValue, row.defaultValue);
      const targetPath = path.join(outDir, record.fileName);

      fs.writeFileSync(targetPath, effectiveValue, { encoding: "utf8" });
      stats.success += 1;

      if (effectiveValue.trim() === "") {
        stats.empty += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  return stats;
}

function removeTempFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outDir = path.resolve(cwd, options.outDir);
  const tempDbPath = path.join(
    os.tmpdir(),
    `toonflow-prompts-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );

  console.log(`Container: ${options.container}`);
  console.log(`Source DB: ${CONTAINER_DB_PATH}`);
  console.log(`Output Dir: ${outDir}`);
  console.log("Copying DB from docker container...");

  try {
    copyDbFromContainer(options.container, tempDbPath);
    const prompts = await loadPrompts(tempDbPath);
    const stats = exportPrompts(prompts, outDir);

    console.log("Export completed.");
    console.log(`Total: ${stats.total}`);
    console.log(`Success: ${stats.success}`);
    console.log(`Empty content: ${stats.empty}`);
    console.log(`Failed: ${stats.failed}`);

    if (stats.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Export failed: ${message}`);
    process.exit(1);
  } finally {
    removeTempFile(tempDbPath);
  }
}

void main();
