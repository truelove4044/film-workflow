import { spawnSync } from "node:child_process";
import path from "node:path";

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`命令执行失败: ${command} ${args.join(" ")}`);
  }
}

function main() {
  const root = process.cwd();
  const oauthVendor = path.join(root, "vendor", "openai-oauth");

  run("yarn", ["install"], root);
  run("yarn", ["--cwd", "website", "install"], root);
  run("npx", ["--yes", "bun@1.2.18", "install"], oauthVendor);

  console.log("\n全部依赖安装完成。\n");
}

main();
