# ChatGPT 登录（Codex 额度）接入说明

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
