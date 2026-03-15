import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import knex from "knex";
import { buildPromptFileRecords } from "./prompt-file-utils";

interface PromptRow {
  id: number;
  code: string | null;
  customValue: string | null;
}

interface CliOptions {
  container: string;
  inDir: string;
}

interface ImportStats {
  filesFound: number;
  matched: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

const CONTAINER_DB_PATH = "/app/db.sqlite";
const DEFAULT_CONTAINER = "toonflow-local";
const DEFAULT_INPUT_DIR = "backup/prompts";

function printHelp() {
  console.log(`Usage:
  tsx scripts/import-prompts.ts [--container <name>] [--inDir <path>]

Options:
  --container   Docker container name (default: ${DEFAULT_CONTAINER})
  --inDir       Input directory for markdown files (default: ${DEFAULT_INPUT_DIR})
  --help, -h    Show help
`);
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    container: DEFAULT_CONTAINER,
    inDir: DEFAULT_INPUT_DIR,
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

    if (arg === "--inDir") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --inDir");
      options.inDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readExecError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown command error";
  const err = error as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
  const stderrText = err.stderr ? err.stderr.toString().trim() : "";
  const stdoutText = err.stdout ? err.stdout.toString().trim() : "";
  return stderrText || stdoutText || err.message;
}

function copyDbFromContainer(container: string, tempDbPath: string) {
  try {
    execFileSync("docker", ["cp", `${container}:${CONTAINER_DB_PATH}`, tempDbPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`Failed to copy DB from container ${container}: ${readExecError(error)}`);
  }
}

function copyDbToContainer(container: string, tempDbPath: string) {
  try {
    execFileSync("docker", ["cp", tempDbPath, `${container}:${CONTAINER_DB_PATH}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`Failed to copy DB back to container ${container}: ${readExecError(error)}`);
  }
}

function restartContainer(container: string) {
  try {
    execFileSync("docker", ["restart", container], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`Failed to restart container ${container}: ${readExecError(error)}`);
  }
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
      .select("id", "code", "customValue")
      .orderBy("id", "asc");
    return rows;
  } finally {
    await db.destroy();
  }
}

function listMarkdownFiles(inDir: string): string[] {
  const files = fs.readdirSync(inDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function applyImports(tempDbPath: string, inDir: string): Promise<ImportStats> {
  const rows = await loadPrompts(tempDbPath);
  const records = buildPromptFileRecords(rows);
  const rowById = new Map<number, PromptRow>(rows.map((row) => [row.id, row]));
  const recordByFileBase = new Map(records.map((record) => [record.fileBase.toLowerCase(), record]));
  const markdownFiles = listMarkdownFiles(inDir);

  const stats: ImportStats = {
    filesFound: markdownFiles.length,
    matched: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  const db = knex({
    client: "sqlite3",
    connection: {
      filename: tempDbPath,
    },
    useNullAsDefault: true,
  });

  try {
    for (const fileName of markdownFiles) {
      try {
        const fileBase = path.parse(fileName).name;
        const record = recordByFileBase.get(fileBase.toLowerCase());

        if (!record) {
          stats.skipped += 1;
          continue;
        }

        const row = rowById.get(record.id);
        if (!row) {
          stats.failed += 1;
          continue;
        }

        const content = fs.readFileSync(path.join(inDir, fileName), "utf8");
        stats.matched += 1;

        if ((row.customValue ?? "") === content) {
          stats.unchanged += 1;
          continue;
        }

        await db("t_prompts").where("id", row.id).update({ customValue: content });
        stats.updated += 1;
      } catch {
        stats.failed += 1;
      }
    }
  } finally {
    await db.destroy();
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
  const inDir = path.resolve(cwd, options.inDir);
  const tempDbPath = path.join(
    os.tmpdir(),
    `toonflow-prompts-import-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );

  console.log(`Container: ${options.container}`);
  console.log(`Source DB: ${CONTAINER_DB_PATH}`);
  console.log(`Input Dir: ${inDir}`);

  if (!fs.existsSync(inDir)) {
    throw new Error(`Input directory does not exist: ${inDir}`);
  }

  try {
    console.log("Copying DB from docker container...");
    copyDbFromContainer(options.container, tempDbPath);

    console.log("Applying prompt imports...");
    const stats = await applyImports(tempDbPath, inDir);

    console.log("Writing DB back to docker container...");
    copyDbToContainer(options.container, tempDbPath);
    console.log("Restarting docker container...");
    restartContainer(options.container);

    console.log("Import completed.");
    console.log(`filesFound: ${stats.filesFound}`);
    console.log(`matched: ${stats.matched}`);
    console.log(`updated: ${stats.updated}`);
    console.log(`unchanged: ${stats.unchanged}`);
    console.log(`skipped: ${stats.skipped}`);
    console.log(`failed: ${stats.failed}`);

    if (stats.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Import failed: ${message}`);
    process.exit(1);
  } finally {
    removeTempFile(tempDbPath);
  }
}

void main();
