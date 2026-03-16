# AI Workflow（小說上傳後）

本文件整理 Toonflow 在「上傳小說文本之後」的 AI 介入流程，並列出每個流程使用的 prompt 來源（清單與用途摘要，不貼全文）。

- 起點（非 AI）：`/novel/addNovel`（`src/routes/novel/addNovel.ts`）
- 不納入：`src/routes/other/test*` 測試路由

## 1. 流程主線（依執行順序）

### 0) 小說上傳（基準步驟，非 AI）

- 入口路由/模組：`/novel/addNovel` → `src/routes/novel/addNovel.ts`
- AI 類型：無
- Prompt 來源：無
- AI model map key：無
- 說明：寫入 `t_novel`，並做章節去重與章節序號正規化。

### 1) 大綱 AI Agent（主控 + 子代理）

- 入口路由/模組：`/outline/agentsOutline`（WebSocket）→ `src/routes/outline/agentsOutline.ts` → `src/agents/outlineScript/index.ts`
- AI 類型：`text`
- Prompt 來源：`t_prompts`
  - 主控：`outlineScript-main`
  - 子代理：`outlineScript-a1`、`outlineScript-a2`、`outlineScript-director`
- AI model map key：`outlineScriptAgent`
- 說明：
  - 主控 Agent 負責對話協調與工具調度。
  - 子代理分工為故事線生成（a1）、大綱生成（a2）、審核修訂（director）。

### 2) 劇本生成

- 入口路由/模組：`/script/generateScriptApi` → `src/routes/script/generateScriptApi.ts` → `src/utils/generateScript.ts`
- AI 類型：`text`
- Prompt 來源：`t_prompts`：`script`
- AI model map key：`generateScript`
- 說明：以大綱參數 + 小說章節內容生成劇本文本，回寫 `t_script.content`。

### 3) 資產提示詞潤色（角色/場景/道具/分鏡）

- 入口路由/模組：`/assets/polishPrompt` → `src/routes/assets/polishPrompt.ts`
- AI 類型：`text`
- Prompt 來源：`t_prompts`
  - `role-polish`
  - `scene-polish`
  - `tool-polish`
  - `storyboard-polish`
- AI model map key：`assetsPrompt`
- 說明：根據專案設定、相關章節內容與資產描述，生成可用於出圖的精煉 prompt。

### 4) 資產圖片生成（角色/場景/道具/分鏡）

- 入口路由/模組：`/assets/generateAssets` → `src/routes/assets/generateAssets.ts`
- AI 類型：`image`
- Prompt 來源：`t_prompts`
  - `role-generateImage`
  - `scene-generateImage`
  - `tool-generateImage`
  - `storyboard-generateImage`
- AI model map key：`assetsImage`
- 說明：依資產類型選擇對應 system prompt + user prompt 生成圖片，寫入 OSS 與資料表。

### 5) 分鏡 AI Agent（片段師 + 分鏡師）

- 入口路由/模組：`/storyboard/chatStoryboard`（WebSocket）→ `src/routes/storyboard/chatStoryboard.ts` → `src/agents/storyboard/index.ts`
- AI 類型：`text`
- Prompt 來源：`t_prompts`
  - 主控：`storyboard-main`
  - 子代理：`storyboard-segment`、`storyboard-shot`
- AI model map key：`storyboardAgent`
- 說明：
  - 片段師（segmentAgent）依劇本切片段。
  - 分鏡師（shotAgent）依片段生成各鏡頭 prompt，並可調用工具更新分鏡資料。

### 6) 分鏡宮格提示詞生成與分鏡出圖

- 入口路由/模組：
  - `src/agents/storyboard/generateImagePromptsTool.ts`
  - `src/agents/storyboard/generateImageTool.ts`
  - （由分鏡流程或 `src/routes/storyboard/generateShotImage.ts` 觸發）
- AI 類型：`text` + `image`
- Prompt 來源：
  - `t_prompts`：`generateImagePrompts`（宮格提示詞潤色）
  - 程式邏輯 prompt（資產相關性篩選 user prompt、資產映射 system prompt）
- AI model map key：
  - 文本階段：`storyboardAgent`
  - 出圖階段：`storyboardImage`
- 說明：
  - 先以文本模型把多鏡頭 prompt 整合為宮格可用提示詞。
  - 再以圖像模型生成宮格圖，分割為單鏡頭圖並回寫分鏡 cell。

### 7) 分鏡轉影片提示詞（單鏡頭）

- 入口路由/模組：`/storyboard/generateVideoPrompt` → `src/routes/storyboard/generateVideoPrompt.ts`
- AI 類型：`text`（含 image input）
- Prompt 來源：`route 內嵌 system prompt`（非 `t_prompts`）
- AI model map key：`videoPrompt`
- 說明：將劇本內容 + 分鏡 prompt + 分鏡圖，轉為結構化 motion prompt（含時長/名稱/內容）。

### 8) 影片提示詞整合（模式化）

- 入口路由/模組：`/video/generatePrompt` → `src/routes/video/generatePrompt.ts`
- AI 類型：`text`
- Prompt 來源：`t_prompts`
  - `video-main`
  - `video-startEnd`
  - `video-multi`
  - `video-single`
  - `video-text`
- AI model map key：`videoPrompt`
- 說明：依模式（startEnd / multi / single / text）組裝 system prompt，輸出可投餵影片模型的描述。

### 9) 影片生成

- 入口路由/模組：`/video/generateVideo` → `src/routes/video/generateVideo.ts`
- AI 類型：`video`
- Prompt 來源：路由中組裝的 `inputPrompt`（非 `t_prompts`）
- AI model map key：無（使用 `t_videoConfig` / `t_config` 指定模型設定）
- 說明：讀取分鏡圖與影片參數，呼叫 `u.ai.video` 非同步生成影片並更新 `t_video.state`。

### 10) 補充分支：分鏡改圖、分鏡超分

- 分鏡改圖
  - 入口路由/模組：`/storyboard/generateStoryboardApi` → `src/routes/storyboard/generateStoryboardApi.ts` → `src/utils/editImage.ts`
  - AI 類型：`image`
  - Prompt 來源：`editImage.ts` 內嵌 `systemPrompt` + 使用者指令
  - AI model map key：`editImage`
- 分鏡超分
  - 入口路由/模組：`/storyboard/batchSuperScoreImage` → `src/routes/storyboard/batchSuperScoreImage.ts`
  - AI 類型：`image`
  - Prompt 來源：route 內嵌超分 `systemPrompt` / `prompt`
  - AI model map key：`storyboardImage`

---

## 2. Prompt 對照表（DB code → 檔案 → 用途）

> 下列皆為 `t_prompts.code`；右欄為對應備份檔 `backup/prompts/*.md`。

| DB code                    | 檔案                                         | 主要用途（摘要）                        |
| -------------------------- | -------------------------------------------- | --------------------------------------- |
| `outlineScript-main`       | `backup/prompts/outlineScript-main.md`       | 大綱主控 Agent 的系統指令與工具協調規範 |
| `outlineScript-a1`         | `backup/prompts/outlineScript-a1.md`         | 子代理 A1：故事線生成                   |
| `outlineScript-a2`         | `backup/prompts/outlineScript-a2.md`         | 子代理 A2：劇集大綱生成                 |
| `outlineScript-director`   | `backup/prompts/outlineScript-director.md`   | 子代理導演：審核與修訂                  |
| `script`                   | `backup/prompts/script.md`                   | 劇本生成 system prompt                  |
| `role-polish`              | `backup/prompts/role-polish.md`              | 角色資產 prompt 潤色                    |
| `scene-polish`             | `backup/prompts/scene-polish.md`             | 場景資產 prompt 潤色                    |
| `tool-polish`              | `backup/prompts/tool-polish.md`              | 道具資產 prompt 潤色                    |
| `storyboard-polish`        | `backup/prompts/storyboard-polish.md`        | 分鏡資產 prompt 潤色                    |
| `role-generateImage`       | `backup/prompts/role-generateImage.md`       | 角色資產出圖                            |
| `scene-generateImage`      | `backup/prompts/scene-generateImage.md`      | 場景資產出圖                            |
| `tool-generateImage`       | `backup/prompts/tool-generateImage.md`       | 道具資產出圖                            |
| `storyboard-generateImage` | `backup/prompts/storyboard-generateImage.md` | 分鏡資產出圖                            |
| `storyboard-main`          | `backup/prompts/storyboard-main.md`          | 分鏡主控 Agent                          |
| `storyboard-segment`       | `backup/prompts/storyboard-segment.md`       | 分鏡子代理：片段生成                    |
| `storyboard-shot`          | `backup/prompts/storyboard-shot.md`          | 分鏡子代理：鏡頭 prompt 生成            |
| `generateImagePrompts`     | `backup/prompts/generateImagePrompts.md`     | 宮格分鏡提示詞整理/潤色                 |
| `video-main`               | `backup/prompts/video-main.md`               | 影片提示詞主模板                        |
| `video-startEnd`           | `backup/prompts/video-startEnd.md`           | 起止幀模式                              |
| `video-multi`              | `backup/prompts/video-multi.md`              | 多圖模式                                |
| `video-single`             | `backup/prompts/video-single.md`             | 單圖模式                                |
| `video-text`               | `backup/prompts/video-text.md`               | 純文字模式                              |

---

## 3. 非 `t_prompts` 的內嵌 Prompt（避免漏列）

1. 分鏡轉影片提示詞（內嵌 system prompt）

- 位置：`src/routes/storyboard/generateVideoPrompt.ts`
- 用途：將分鏡圖與劇本上下文轉為 motion prompt JSON。
- model map key：`videoPrompt`

2. 分鏡改圖內嵌 prompt

- 位置：`src/utils/editImage.ts`
- 用途：以「修改指令 + 參考圖」進行定向重繪。
- model map key：`editImage`

3. 分鏡超分內嵌 prompt

- 位置：`src/routes/storyboard/batchSuperScoreImage.ts`
- 用途：超分到指定解析度且保持內容不變。
- model map key：`storyboardImage`

4. ModelScope 長 prompt 壓縮（條件觸發）

- 位置：`src/utils/ai/image/owned/modelScope.ts` 的 `compressionPrompt(...)`
- 觸發條件：組合後 prompt 長度大於 2000 字元。
- 用途：先做文本壓縮再送圖像生成 API。
- model map key：`assetsPrompt`

---

## 4. 主要 AI model map key 速查

- `outlineScriptAgent`：大綱 Agent（主控 + 子代理）
- `generateScript`：劇本生成
- `assetsPrompt`：資產 prompt 潤色（含 ModelScope 壓縮文本）
- `assetsImage`：資產圖片生成
- `storyboardAgent`：分鏡 Agent 與分鏡文本處理
- `storyboardImage`：分鏡出圖/超分
- `videoPrompt`：影片 prompt 相關文本生成
- `editImage`：分鏡改圖

---

## 5. 備註

- 本文件聚焦「小說上傳後」正式產品流程中的 AI 介入節點。
- `other/testAI`、`other/testImage`、`other/testVideo` 屬測試用途，不納入正式流程。
