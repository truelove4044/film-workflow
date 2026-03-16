# ChatGPT 登录（Codex 额度）接入说明

## 前置条件

- 需使用 **file-based credential storage**，并确保主机 `~/.codex/auth.json` 可读取。
- 若仅挂载 `~/.codex` 但其中没有 `auth.json`，容器内无法保证读取到凭证。
- `~/.codex/auth.json` 视同敏感凭证，不可提交到版本控制，也不可暴露给非必要用户或公开卷。

## 目录结构

`openai-oauth` 已内置在项目目录：

`vendor/openai-oauth`

该目录用于版本留存与源码参考；运行代理建议直接使用根目录脚本。

## 启动步骤（PowerShell）

1. 首次登录 ChatGPT/Codex 凭证

```powershell
yarn oauth:login
```

2. 启动本机 OAuth Proxy（固定端口 `10531`）

```powershell
yarn oauth:proxy
```

成功后应可访问：

- `http://127.0.0.1:10531/health`
- `http://127.0.0.1:10531/v1/models`

## 应用内配置

1. 打开模型设置，选择文本模型。
2. 点击 `ChatGPT 登录（Codex额度）` 卡片。
3. 系统会自动读取本机 Proxy 模型列表，并写入：
   - `manufacturer = chatgptOauth`
   - `baseUrl = http://127.0.0.1:10531/v1`
   - `apiKey = oauth-local`（占位值）

## 说明

- 此选项仅用于文本任务。
- 图片/视频模型仍走原有供应商链路，不使用 Codex 额度。
- 若提示凭证失效，请重新执行 `yarn oauth:login`。
- 新增「登录配置」下方一键流程：可执行 `codex login --device-auth` 并自动拉起代理。

## Docker 自动启动说明

- Docker 默认会尝试自动启动 `openai-oauth proxy`。
- 需要将主机 `~/.codex` 挂载到容器 `/root/.codex`（项目 compose 已配置）。
- 若未找到 `/root/.codex/auth.json`，系统会将 proxy 标记为 `stopped`，不视为服务异常；此时可：
  - 先在主机完成 `codex login`，或
  - 在应用内点击「一键登录并启动代理」。
- 代理默认绑定 `127.0.0.1:10531`，仅适用于 app 与 proxy 在同一容器。
  - 若改为跨容器或需从 host/其他服务访问，需改成 `0.0.0.0:10531` 并配置对应 `ports/network`。
