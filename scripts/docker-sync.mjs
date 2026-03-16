import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const mode = process.argv[2] || "all";
const containerName = process.env.TOONFLOW_CONTAINER || "toonflow-local";

function resolveCommand(command) {
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  return command;
}

function quoteArg(arg) {
  if (!arg || /[\s"]/u.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

function run(command, args, cwd = root) {
  const resolvedCommand = resolveCommand(command);
  const displayCommand = `${resolvedCommand} ${args.join(" ")}`;
  console.log(`\n> ${displayCommand}\n`);
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${quoteArg(resolvedCommand)} ${args.map(quoteArg).join(" ")}`], {
        cwd,
        stdio: "inherit",
        shell: false,
      })
    : spawnSync(resolvedCommand, args, {
        cwd,
        stdio: "inherit",
        shell: false,
      });

  if (result.status !== 0) {
    throw new Error(`命令执行失败: ${displayCommand}`);
  }
}

function syncWeb() {
  run("npm", ["--prefix", "website", "run", "build:web"]);
  run("docker", ["cp", path.join(root, "scripts", "web", "index.html"), `${containerName}:/usr/share/nginx/html/index.html`]);
  console.log(`\n前端已同步到容器 ${containerName}。\n`);
}

function syncBackend() {
  run("npm", ["run", "build"]);
  run("docker", ["cp", path.join(root, "build", "app.js"), `${containerName}:/app/build/app.js`]);
  run("docker", ["exec", containerName, "pm2", "restart", "app"]);
  console.log(`\n后端已同步到容器 ${containerName}。\n`);
}

function main() {
  if (!["web", "backend", "all"].includes(mode)) {
    throw new Error(`不支持的同步模式: ${mode}`);
  }

  if (mode === "web") {
    syncWeb();
    return;
  }

  if (mode === "backend") {
    syncBackend();
    return;
  }

  syncWeb();
  syncBackend();
}

main();
