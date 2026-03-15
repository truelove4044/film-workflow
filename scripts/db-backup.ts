import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const dbPath = path.join(rootDir, "db.sqlite");
const backupDir = path.join(rootDir, "backup", "db");
const defaultContainerDbPath = "/app/db.sqlite";

interface CommandOptions {
  fileArg?: string;
  containerName?: string;
}

function printHelp() {
  console.log(`用法:
  tsx scripts/db-backup.ts backup [--container <name>]
  tsx scripts/db-backup.ts restore [--file <path|filename>] [--container <name>]

说明:
  backup                                  备份当前数据库到 backup/db
  restore                                 还原 backup/db 中最新一份备份
  restore --file <file>                   还原指定备份文件（支持绝对路径或 backup/db 下文件名）
  --container <name>                      对指定 Docker 容器里的 /app/db.sqlite 操作
`);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function ensureBackupDir() {
  fs.mkdirSync(backupDir, { recursive: true });
}

function isLockError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const err = error as NodeJS.ErrnoException;
  return err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES";
}

function readExecError(error: unknown): string {
  if (!(error instanceof Error)) return "未知错误";
  const err = error as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
  const stderrText = err.stderr ? err.stderr.toString().trim() : "";
  const stdoutText = err.stdout ? err.stdout.toString().trim() : "";
  return stderrText || stdoutText || err.message;
}

function fail(message: string, error?: unknown): never {
  console.error(`错误: ${message}`);
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code) {
      console.error(`错误代码: ${err.code}`);
    }
    if (error.message) {
      console.error(`详情: ${error.message}`);
    }
  }
  process.exit(1);
}

function dockerCopyFrom(containerName: string, source: string, target: string) {
  try {
    execFileSync("docker", ["cp", `${containerName}:${source}`, target], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    fail(`从容器复制数据库失败（容器: ${containerName}）`, new Error(readExecError(error)));
  }
}

function dockerCopyTo(containerName: string, source: string, target: string) {
  try {
    execFileSync("docker", ["cp", source, `${containerName}:${target}`], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    fail(`写入容器数据库失败（容器: ${containerName}）`, new Error(readExecError(error)));
  }
}

function dockerRestartContainer(containerName: string) {
  try {
    execFileSync("docker", ["restart", containerName], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    fail(`还原后自动重启容器失败（容器: ${containerName}）`, new Error(readExecError(error)));
  }
}

function backupDatabase(options: CommandOptions) {
  const { containerName } = options;
  if (!fs.existsSync(dbPath)) {
    if (!containerName) {
      fail(`未找到数据库文件: ${dbPath}`);
    }
  }

  ensureBackupDir();
  const fileName = `db-${formatTimestamp(new Date())}.sqlite`;
  const targetPath = path.join(backupDir, fileName);

  if (containerName) {
    dockerCopyFrom(containerName, defaultContainerDbPath, targetPath);
    console.log(`备份成功(容器:${containerName}): ${targetPath}`);
    return;
  }

  try {
    fs.copyFileSync(dbPath, targetPath);
  } catch (error) {
    fail("备份数据库失败", error);
  }

  console.log(`备份成功: ${targetPath}`);
}

function listBackupCandidates(): string[] {
  if (!fs.existsSync(backupDir)) return [];
  const files = fs.readdirSync(backupDir);
  const matched = files.filter((file) => /^db-\d{8}_\d{6}\.sqlite$/.test(file));
  matched.sort();
  return matched;
}

function resolveRestoreSource(fileArg: string | undefined): string {
  if (fileArg) {
    const candidate = path.isAbsolute(fileArg) ? fileArg : path.join(backupDir, fileArg);
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) {
      fail(`指定的备份文件不存在: ${resolved}`);
    }
    return resolved;
  }

  const candidates = listBackupCandidates();
  if (candidates.length === 0) {
    fail(`备份目录中没有可还原的备份文件: ${backupDir}`);
  }
  return path.join(backupDir, candidates[candidates.length - 1]!);
}

function restoreDatabase(options: CommandOptions) {
  const { fileArg, containerName } = options;
  ensureBackupDir();

  const sourcePath = resolveRestoreSource(fileArg);
  const snapshotName = `db-pre-restore-${formatTimestamp(new Date())}.sqlite`;
  const snapshotPath = path.join(backupDir, snapshotName);

  if (containerName) {
    dockerCopyFrom(containerName, defaultContainerDbPath, snapshotPath);
    dockerCopyTo(containerName, sourcePath, defaultContainerDbPath);
    dockerRestartContainer(containerName);
    console.log(`快照已创建(容器:${containerName}): ${snapshotPath}`);
    console.log(`还原成功，来源: ${sourcePath}`);
    console.log(`容器已自动重启: ${containerName}`);
    return;
  }

  if (!fs.existsSync(dbPath)) {
    fail(`未找到当前数据库文件，无法创建还原前快照: ${dbPath}`);
  }

  try {
    fs.copyFileSync(dbPath, snapshotPath);
  } catch (error) {
    if (isLockError(error)) {
      fail("当前数据库可能被占用，无法创建快照，请先停止服务后重试", error);
    }
    fail("创建还原前快照失败", error);
  }

  try {
    fs.copyFileSync(sourcePath, dbPath);
  } catch (error) {
    if (isLockError(error)) {
      fail("数据库文件可能被占用，无法还原，请先停止服务后重试", error);
    }
    fail("还原数据库失败", error);
  }

  console.log(`快照已创建: ${snapshotPath}`);
  console.log(`还原成功，来源: ${sourcePath}`);
}

function parseCommandOptions(args: string[], command: "backup" | "restore"): CommandOptions {
  const options: CommandOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--file") {
      if (command !== "restore") {
        fail("backup 命令不支持 --file 参数");
      }
      const value = args[index + 1];
      if (!value) {
        fail("参数 --file 缺少文件路径");
      }
      options.fileArg = value;
      index += 1;
      continue;
    }

    if (arg === "--container") {
      const value = args[index + 1];
      if (!value) {
        fail("参数 --container 缺少容器名");
      }
      options.containerName = value;
      index += 1;
      continue;
    }

    fail(`未知参数: ${arg}`);
  }

  return options;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "backup") {
    const options = parseCommandOptions(args.slice(1), "backup");
    backupDatabase(options);
    return;
  }

  if (command === "restore") {
    const options = parseCommandOptions(args.slice(1), "restore");
    restoreDatabase(options);
    return;
  }

  fail(`未知命令: ${command}`);
}

main();
