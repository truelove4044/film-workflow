import axios from "axios";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import normalizeError from "@/utils/error";

type LoginStatus = "idle" | "running" | "awaiting_auth" | "success" | "failed";
type ProxyStatus = "stopped" | "starting" | "running" | "failed";
type LogLevel = "info" | "warn" | "error";

interface CommandSpec {
  command: string;
  args: string[];
}

interface ProbeResult {
  available: boolean;
  healthy: boolean;
  modelCount: number;
  message: string;
}

interface AuthInfo {
  filePath: string;
  maskedPath: string;
  readable: boolean;
}

export interface ChatgptOauthRuntimeStatus {
  loginStatus: LoginStatus;
  proxyStatus: ProxyStatus;
  awaiting_auth: boolean;
  running: boolean;
  pid: number | null;
  message: string;
  logs: string[];
  lastUpdatedAt: number;
  authFileReadable: boolean;
  authPath: string;
  proxyAvailable: boolean;
  proxyHealthy: boolean;
  modelCount: number;
}

class ChatgptOauthRuntimeManager {
  private readonly proxyHost = process.env.CHATGPT_OAUTH_PROXY_HOST || "127.0.0.1";
  private readonly proxyPort = Number(process.env.CHATGPT_OAUTH_PROXY_PORT || 10531);
  private readonly loginTimeoutMs = 10 * 60 * 1000;
  private readonly maxLogs = 120;

  private proxyProcess: ChildProcessWithoutNullStreams | null = null;
  private flowPromise: Promise<void> | null = null;
  private bootChecked = false;

  private state: ChatgptOauthRuntimeStatus = {
    loginStatus: "idle",
    proxyStatus: "stopped",
    awaiting_auth: false,
    running: false,
    pid: null,
    message: "尚未执行一键登录流程",
    logs: [],
    lastUpdatedAt: Date.now(),
    authFileReadable: false,
    authPath: "",
    proxyAvailable: false,
    proxyHealthy: false,
    modelCount: 0,
  };

  private get proxyRoot() {
    return `http://${this.proxyHost}:${this.proxyPort}`;
  }

  private get proxyBaseUrl() {
    return `${this.proxyRoot}/v1`;
  }

  private setState(patch: Partial<ChatgptOauthRuntimeStatus>) {
    this.state = {
      ...this.state,
      ...patch,
      lastUpdatedAt: Date.now(),
    };
  }

  private pushLog(level: LogLevel, message: string) {
    const line = `[${new Date().toLocaleString()}] [${level.toUpperCase()}] ${message}`;
    const nextLogs = [...this.state.logs, line];
    if (nextLogs.length > this.maxLogs) {
      nextLogs.splice(0, nextLogs.length - this.maxLogs);
    }
    this.setState({ logs: nextLogs });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createError(message: string, code?: string) {
    const err = new Error(message) as Error & { code?: string };
    if (code) err.code = code;
    return err;
  }

  private isCommandMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
  }

  private isProxyProcessAlive() {
    return !!this.proxyProcess && !this.proxyProcess.killed && this.proxyProcess.exitCode == null;
  }

  private maskPath(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/");
    const dir = path.basename(path.dirname(normalized));
    const file = path.basename(normalized);
    return `.../${dir}/${file}`;
  }

  private resolveAuthInfo(): AuthInfo {
    const candidates: string[] = [];
    const authFile = process.env.CODEX_AUTH_FILE;
    const authDir = process.env.CODEX_AUTH_DIR;
    const chatgptLocalHome = process.env.CHATGPT_LOCAL_HOME;
    const codexHome = process.env.CODEX_HOME;
    const home = os.homedir();

    if (authFile) candidates.push(path.resolve(authFile));
    if (authDir) candidates.push(path.resolve(path.join(authDir, "auth.json")));
    if (chatgptLocalHome) candidates.push(path.resolve(path.join(chatgptLocalHome, "auth.json")));
    if (codexHome) candidates.push(path.resolve(path.join(codexHome, "auth.json")));
    if (home) {
      candidates.push(path.resolve(path.join(home, ".chatgpt-local", "auth.json")));
      candidates.push(path.resolve(path.join(home, ".codex", "auth.json")));
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    for (const candidate of uniqueCandidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        fs.accessSync(candidate, fs.constants.R_OK);
        return {
          filePath: candidate,
          maskedPath: this.maskPath(candidate),
          readable: true,
        };
      } catch {
        return {
          filePath: candidate,
          maskedPath: this.maskPath(candidate),
          readable: false,
        };
      }
    }

    const fallback = uniqueCandidates[uniqueCandidates.length - 1] || path.resolve(path.join(home || ".", ".codex", "auth.json"));
    return {
      filePath: fallback,
      maskedPath: this.maskPath(fallback),
      readable: false,
    };
  }

  private refreshAuthInfo(): AuthInfo {
    const authInfo = this.resolveAuthInfo();
    this.setState({
      authFileReadable: authInfo.readable,
      authPath: authInfo.maskedPath,
    });
    return authInfo;
  }

  private parseOutputLines(raw: Buffer, prefix: string) {
    const text = raw.toString("utf8");
    if (!text.trim()) return;

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line);
    for (const line of lines) {
      this.pushLog("info", `${prefix}: ${line}`);
    }
  }

  private async runSingleCommand(spec: CommandSpec, timeoutMs: number) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        shell: false,
        env: process.env,
      });

      this.pushLog("info", `执行命令: ${spec.command} ${spec.args.join(" ")}`);
      this.setState({
        loginStatus: "awaiting_auth",
        awaiting_auth: true,
        message: "请完成外部装置授权（device auth）",
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(this.createError("登录等待超时（10分钟），请重试", "LOGIN_TIMEOUT"));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => this.parseOutputLines(chunk, "login"));
      child.stderr.on("data", (chunk: Buffer) => this.parseOutputLines(chunk, "login"));

      child.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        if (error.code === "ENOENT") {
          reject(this.createError(`命令不存在: ${spec.command}`, "ENOENT"));
          return;
        }
        reject(error);
      });

      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(this.createError(`登录命令执行失败，退出码: ${code ?? "unknown"}`));
      });
    });
  }

  private async runCommandWithFallback(candidates: CommandSpec[], timeoutMs: number) {
    let lastError: unknown;
    for (const spec of candidates) {
      try {
        await this.runSingleCommand(spec, timeoutMs);
        return;
      } catch (error) {
        lastError = error;
        if (this.isCommandMissing(error)) continue;
        throw error;
      }
    }
    throw lastError || this.createError("未找到可用命令，请安装 codex CLI");
  }

  private async probeProxy(): Promise<ProbeResult> {
    try {
      const healthRes = await axios.get(`${this.proxyRoot}/health`, { timeout: 4000 });
      const modelsRes = await axios.get(`${this.proxyBaseUrl}/models`, { timeout: 4000 });
      const modelList = Array.isArray(modelsRes.data?.data) ? modelsRes.data.data : [];
      const healthy = healthRes.data?.ok === true;
      return {
        available: healthy,
        healthy,
        modelCount: modelList.length,
        message: healthy ? "Proxy 可用" : "Proxy 健康检查异常",
      };
    } catch (error) {
      const normalized = normalizeError(error);
      return {
        available: false,
        healthy: false,
        modelCount: 0,
        message: normalized.message || "Proxy 不可用",
      };
    }
  }

  private applyProbeResult(probe: ProbeResult) {
    this.setState({
      proxyAvailable: probe.available,
      proxyHealthy: probe.healthy,
      modelCount: probe.modelCount,
    });
  }

  private bindProxyProcess(child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => this.parseOutputLines(chunk, "proxy"));
    child.stderr.on("data", (chunk: Buffer) => this.parseOutputLines(chunk, "proxy"));

    child.on("exit", (code, signal) => {
      if (this.proxyProcess && child.pid === this.proxyProcess.pid) {
        this.proxyProcess = null;
        this.pushLog("warn", `Proxy 进程退出 (code=${code ?? "null"}, signal=${signal ?? "null"})`);
        if (!this.state.running) {
          this.setState({
            pid: null,
            proxyStatus: "stopped",
            proxyAvailable: false,
            proxyHealthy: false,
            modelCount: 0,
            message: "Proxy 已停止",
          });
        }
      }
    });
  }

  private async spawnProxyWithFallback(candidates: CommandSpec[]) {
    let lastError: unknown;
    for (const spec of candidates) {
      try {
        const child = await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
          const proc = spawn(spec.command, spec.args, {
            shell: false,
            env: process.env,
          });

          proc.once("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
              reject(this.createError(`命令不存在: ${spec.command}`, "ENOENT"));
              return;
            }
            reject(error);
          });

          proc.once("spawn", () => resolve(proc));
        });

        this.pushLog("info", `启动 Proxy 命令: ${spec.command} ${spec.args.join(" ")}`);
        return child;
      } catch (error) {
        lastError = error;
        if (this.isCommandMissing(error)) continue;
        throw error;
      }
    }
    throw lastError || this.createError("未找到可用命令，请安装 openai-oauth");
  }

  private async waitForProxyHealthy(timeoutMs: number): Promise<ProbeResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const probe = await this.probeProxy();
      if (probe.available) return probe;
      if (!this.isProxyProcessAlive()) return probe;
      await this.delay(1000);
    }
    return {
      available: false,
      healthy: false,
      modelCount: 0,
      message: "Proxy 健康检查超时",
    };
  }

  private async stopManagedProxy(reason: string) {
    const child = this.proxyProcess;
    if (!child) return;

    this.pushLog("warn", `停止 Proxy：${reason}`);
    child.kill();
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      this.delay(3000),
    ]);
    this.proxyProcess = null;
    this.setState({
      pid: null,
      proxyStatus: "stopped",
      proxyAvailable: false,
      proxyHealthy: false,
      modelCount: 0,
    });
  }

  private async startProxy() {
    const authInfo = this.refreshAuthInfo();
    const proxyArgs = ["openai-oauth", "--host", this.proxyHost, "--port", String(this.proxyPort), "--oauth-file", authInfo.filePath];
    const candidates: CommandSpec[] = [
      { command: "openai-oauth", args: ["--host", this.proxyHost, "--port", String(this.proxyPort), "--oauth-file", authInfo.filePath] },
      { command: "npx", args: ["--yes", ...proxyArgs] },
    ];

    this.setState({
      proxyStatus: "starting",
      message: "正在启动 openai-oauth proxy...",
    });

    const child = await this.spawnProxyWithFallback(candidates);
    this.proxyProcess = child;
    this.bindProxyProcess(child);
    this.setState({ pid: child.pid ?? null });

    const probe = await this.waitForProxyHealthy(20000);
    this.applyProbeResult(probe);
    if (!probe.available) {
      await this.stopManagedProxy("健康检查失败");
      throw this.createError(probe.message || "Proxy 启动失败");
    }

    this.setState({
      proxyStatus: "running",
      message: "Proxy 运行中",
    });
  }

  private async restartProxy() {
    if (this.isProxyProcessAlive()) {
      await this.stopManagedProxy("重新加载登录凭证");
    }
    await this.startProxy();
  }

  private async runLoginFlow() {
    this.setState({
      loginStatus: "running",
      awaiting_auth: false,
      message: "开始执行 Codex 登录...",
    });

    const candidates: CommandSpec[] = [
      { command: "codex", args: ["login", "--device-auth"] },
      { command: "npx", args: ["--yes", "@openai/codex", "login", "--device-auth"] },
    ];

    await this.runCommandWithFallback(candidates, this.loginTimeoutMs);
    this.setState({
      loginStatus: "success",
      awaiting_auth: false,
      message: "Codex 登录成功",
    });
  }

  private async executeStartFlow() {
    this.setState({
      running: true,
      message: "开始执行一键登录流程...",
    });

    const authInfo = this.refreshAuthInfo();
    if (!authInfo.readable) {
      this.pushLog("warn", "未检测到可读 auth.json，主机可能未使用 file-based credential storage");
      this.setState({
        message: "未检测到可读 auth.json，可能未使用 file-based credential storage",
      });
    }

    const proxyBefore = await this.probeProxy();
    this.applyProbeResult(proxyBefore);
    if (proxyBefore.available) {
      this.setState({ proxyStatus: "running" });
      this.pushLog("info", "检测到 Proxy 已在运行，登录后将执行验证流程");
    }

    await this.runLoginFlow();

    if (proxyBefore.available) {
      const verify = await this.probeProxy();
      this.applyProbeResult(verify);
      if (!verify.available) {
        this.pushLog("warn", "登录后 Proxy 验证失败，尝试自动重启");
        await this.restartProxy();
      }
    } else {
      await this.startProxy();
    }

    const finalProbe = await this.probeProxy();
    this.applyProbeResult(finalProbe);
    if (!finalProbe.available) {
      throw this.createError("Proxy 健康检查失败，请重新登录后重试");
    }

    this.setState({
      loginStatus: "success",
      proxyStatus: "running",
      awaiting_auth: false,
      message: "登录并启动代理成功",
    });
  }

  private handleStartError(error: unknown) {
    const normalized = normalizeError(error);
    this.pushLog("error", normalized.message || "一键登录流程失败");
    this.setState({
      loginStatus: "failed",
      awaiting_auth: false,
      message: normalized.message || "一键登录流程失败",
    });
  }

  public triggerStartFlow() {
    if (this.flowPromise) {
      return {
        accepted: false,
        message: "流程正在执行，请稍候",
      };
    }

    this.flowPromise = this.executeStartFlow()
      .catch((error) => {
        this.handleStartError(error);
      })
      .finally(() => {
        this.setState({ running: false, awaiting_auth: false });
        this.flowPromise = null;
      });

    return {
      accepted: true,
      message: "已开始执行一键登录流程",
    };
  }

  public async refreshStatus() {
    this.refreshAuthInfo();
    const probe = await this.probeProxy();
    this.applyProbeResult(probe);

    if (probe.available) {
      this.setState({ proxyStatus: "running" });
      return;
    }

    if (this.state.proxyStatus === "starting" || this.state.running) return;
    if (this.isProxyProcessAlive()) {
      this.setState({ proxyStatus: "failed" });
      return;
    }
    this.setState({ proxyStatus: "stopped", pid: null });
  }

  public getStatus(): ChatgptOauthRuntimeStatus {
    return {
      ...this.state,
      logs: [...this.state.logs],
    };
  }

  public async autoStartOnBoot() {
    if (this.bootChecked) return;
    this.bootChecked = true;

    if (process.env.CHATGPT_OAUTH_AUTOSTART !== "true") return;

    this.pushLog("info", "检测到 Docker 自启动配置，尝试启动 openai-oauth proxy");
    const authInfo = this.refreshAuthInfo();
    if (!authInfo.readable) {
      this.setState({
        proxyStatus: "stopped",
        message: "未检测到可读 auth.json，Proxy 保持 stopped，可在 UI 一键登录",
      });
      this.pushLog("warn", "未检测到 /root/.codex/auth.json，跳过自启动");
      return;
    }

    const probe = await this.probeProxy();
    this.applyProbeResult(probe);
    if (probe.available) {
      this.setState({
        proxyStatus: "running",
        message: "Proxy 已在运行",
      });
      return;
    }

    try {
      await this.startProxy();
      const finalProbe = await this.probeProxy();
      this.applyProbeResult(finalProbe);
      if (!finalProbe.available) {
        this.setState({
          proxyStatus: "failed",
          message: "Proxy 自启动后健康检查失败，请重新登录",
        });
        return;
      }
      this.setState({
        proxyStatus: "running",
        message: "Proxy 自启动成功",
      });
    } catch (error) {
      const normalized = normalizeError(error);
      this.pushLog("error", `Proxy 自启动失败: ${normalized.message}`);
      this.setState({
        proxyStatus: "failed",
        message: `Proxy 自启动失败: ${normalized.message}`,
      });
    }
  }
}

const chatgptOauthRuntimeManager = new ChatgptOauthRuntimeManager();

export default chatgptOauthRuntimeManager;
