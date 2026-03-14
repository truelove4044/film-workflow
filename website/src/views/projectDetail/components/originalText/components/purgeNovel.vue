<template>
  <div class="purgeNovel">
    <t-dialog :footer="false" v-model:visible="purgeNovelShow" header="上传小说原文" width="50%" placement="center">
      <div class="data">
        <t-tabs v-model="activeKey">
          <!-- 第一步：上传/粘贴内容 -->
          <t-tab-panel value="To1" label="第一步">
            <div class="upload-area" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
              <t-upload
                ref="uploadRef"
                v-model="fileList"
                theme="file"
                :multiple="true"
                :max="200"
                :before-all-files-upload="handleBeforeAllFilesUpload"
                :request-method="noopRequestMethod"
                style="display: none" />
              <div class="dragIcon">
                <i-upload-one theme="outline" size="32" fill="var(--td-brand-color)" />
              </div>
              <p class="upload-text">拖拽小说原文文件到此处或点击上传</p>
              <p class="upload-hint">支持 .txt, .docx 格式，建议文件大小不超过 10MB</p>
            </div>

            <t-divider>或</t-divider>

            <div class="formItem">
              <div class="label">直接粘贴小说原文内容</div>
              <div class="uploadWrap">
                <t-textarea v-model="content" placeholder="请输入小说原文内容" :autosize="{ minRows: 12, maxRows: 12 }" />
              </div>
              <div class="footerInfo f ac jb" style="margin-top: 8px">
                <div>
                  <span class="charCount">{{ content.length }} 字符</span>
                  <span v-if="content.length > 0 && content.length < 100" class="tips warn">内容过短，建议至少100字符</span>
                </div>
                <span>已解析 {{ tableData.length }} 章节</span>
              </div>
            </div>

            <div style="margin-top: 16px; text-align: right">
              <t-button theme="primary" style="margin-left: 10px" :disabled="!tableData.length" @click="activeKey = 'To2'">下一步</t-button>
            </div>
          </t-tab-panel>

          <!-- 第二步：选择章节 -->
          <t-tab-panel value="To2" label="第二步">
            <div>
              <t-table
                ref="tableRef"
                row-key="rowKey"
                :data="tableData"
                :columns="columns"
                :selected-row-keys="selectedRowKeys"
                hover
                max-height="500"
                @select-change="onSelectChange">
                <template #chapterData="{ row }">
                  <t-tooltip :content="row.chapterData" placement="top">
                    <span class="ellipsis-text">{{ row.chapterData }}</span>
                  </t-tooltip>
                </template>
              </t-table>
            </div>

            <div class="selected-info">已勾选：{{ selectedTextLength }}字(小于200000字)</div>

            <div style="margin-top: 16px; text-align: right">
              <t-button variant="outline" @click="activeKey = 'To1'">上一步</t-button>
              <t-button theme="primary" style="margin-left: 10px" :disabled="selectedTextLength > 200000" @click="handleSubmit">保存</t-button>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElLoading } from "element-plus";
import mammoth from "mammoth";
import { MessagePlugin, type UploadFile } from "tdesign-vue-next";

interface ChapterItem {
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
}

interface ParsedChapterItem extends ChapterItem {
  rowKey: string;
  sourceFile: string;
}

const purgeNovelShow = defineModel<boolean>("modelValue");
const emit = defineEmits<{ select: [chapters: ChapterItem[]] }>();

const activeKey = ref("To1");
const tableRef = ref();
const uploadRef = ref();
const content = ref("");
const fileList = ref<UploadFile[]>([]);
const selectedRowKeys = ref<string[]>([]);
const parsedChapters = ref<ParsedChapterItem[]>([]);
const noopRequestMethod = () => Promise.resolve({ status: "success" as const, response: {} });

const columns = [
  { colKey: "row-select", type: "multiple" as const, width: 60 },
  { colKey: "index", title: "章", width: 100 },
  { colKey: "reel", title: "卷", width: 100 },
  { colKey: "chapter", title: "章节名称", width: 200, ellipsis: true },
  { colKey: "chapterData", title: "章节内容", ellipsis: true },
];

const tableData = computed<ParsedChapterItem[]>(() => parsedChapters.value);
const selectedRows = computed(() => tableData.value.filter((item) => selectedRowKeys.value.includes(item.rowKey)));
const selectedTextLength = computed(() => selectedRows.value.reduce((sum, item) => sum + item.chapterData.length, 0));

const fileNameCollator = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });
const chapterPrefixRegex = /^第[0-9０-９一二三四五六七八九十百千兩零〇]+章[ \u3000]*/;

function triggerUpload() {
  uploadRef.value?.triggerUpload();
}

async function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files?.length) {
    await processFiles(Array.from(files));
  }
}

async function handleBeforeAllFilesUpload(files: Array<{ raw?: File }>) {
  const rawFiles = files.map((item) => item.raw).filter((item): item is File => Boolean(item));
  await processFiles(rawFiles);
  return false;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function getFileBaseName(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(0, idx) : name;
}

function getLeadingIndex(name: string): number | null {
  const matched = getFileBaseName(name).match(/^(\d+)/);
  if (!matched) return null;
  return Number.parseInt(matched[1], 10);
}

function splitChapterTitleAndBody(rawText: string, fileName: string): { chapter: string; chapterData: string } {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { chapter: getFileBaseName(fileName), chapterData: "" };
  }

  const lines = normalized.split("\n");
  const firstLine = (lines.shift() || "").trim();
  const cleanedTitle = firstLine.replace(chapterPrefixRegex, "").trim();

  return {
    chapter: cleanedTitle || firstLine || getFileBaseName(fileName),
    chapterData: lines.join("\n").trim(),
  };
}

async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (file.type === "text/plain" || getFileExt(file.name) === ".txt") {
    return new TextDecoder().decode(buffer);
  }
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function processFiles(files: File[]) {
  if (!files.length) return;

  const sortedFiles = [...files].sort((a, b) => fileNameCollator.compare(a.name, b.name));
  const failedNames: string[] = [];
  const parsedFiles: Array<{ file: File; rawText: string; fileIndex: number | null }> = [];

  const loading = ElLoading.service({ lock: true, text: "文件解析中...", background: "rgba(0,0,0,0.7)" });
  try {
    for (const rawFile of sortedFiles) {
      const ext = getFileExt(rawFile.name);
      const isTxt = ext === ".txt" || rawFile.type === "text/plain";
      const isDocx = ext === ".docx" || rawFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      if (ext === ".doc" || rawFile.type === "application/msword") {
        failedNames.push(rawFile.name);
        continue;
      }
      if (!isTxt && !isDocx) {
        failedNames.push(rawFile.name);
        continue;
      }
      if (rawFile.size > 10 * 1024 * 1024) {
        failedNames.push(rawFile.name);
        continue;
      }

      try {
        const rawText = await readFile(rawFile);
        parsedFiles.push({ file: rawFile, rawText, fileIndex: getLeadingIndex(rawFile.name) });
      } catch {
        failedNames.push(rawFile.name);
      }
    }
  } finally {
    loading.close();
  }

  if (!parsedFiles.length) {
    MessagePlugin.error("文件解析失败，请重新上传");
    if (failedNames.length) {
      MessagePlugin.warning(`以下文件已跳过：${failedNames.join("、")}`);
    }
    return;
  }

  const withIndex = parsedFiles.filter((item) => item.fileIndex !== null) as Array<{
    file: File;
    rawText: string;
    fileIndex: number;
  }>;
  const withoutIndex = parsedFiles.filter((item) => item.fileIndex === null);

  const mergedList: ParsedChapterItem[] = [];
  for (const item of withIndex) {
    const { chapter, chapterData } = splitChapterTitleAndBody(item.rawText, item.file.name);
    mergedList.push({
      rowKey: `${item.file.name}-${item.fileIndex}-${mergedList.length}`,
      sourceFile: item.file.name,
      index: item.fileIndex,
      reel: "正文",
      chapter,
      chapterData,
    });
  }

  const maxIndex = withIndex.reduce((max, item) => Math.max(max, item.fileIndex), 0);
  let nextIndex = maxIndex + 1;
  for (const item of withoutIndex) {
    const { chapter, chapterData } = splitChapterTitleAndBody(item.rawText, item.file.name);
    mergedList.push({
      rowKey: `${item.file.name}-${nextIndex}-${mergedList.length}`,
      sourceFile: item.file.name,
      index: nextIndex,
      reel: "正文",
      chapter,
      chapterData,
    });
    nextIndex += 1;
  }

  parsedChapters.value = mergedList;
  selectedRowKeys.value = [];
  content.value = parsedFiles
    .map((item) => item.rawText.trim())
    .filter(Boolean)
    .join("\r\n\r\n");

  if (failedNames.length) {
    MessagePlugin.warning(`以下文件已跳过：${failedNames.join("、")}`);
  }
}

function onSelectChange(selectedKeys: Array<string | number>) {
  selectedRowKeys.value = selectedKeys.map((item) => String(item));
}

function handleSubmit() {
  if (!selectedRows.value.length) {
    MessagePlugin.warning("请先选择章节");
    return;
  }

  emit(
    "select",
    selectedRows.value.map(({ index, reel, chapter, chapterData }) => ({
      index,
      reel,
      chapter,
      chapterData,
    })),
  );
}
</script>

<style lang="scss" scoped>
.upload-area {
  padding: 42px 20px;
  background-color: var(--td-bg-color-secondarycontainer);
  border: 2px dashed var(--td-component-border);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: var(--td-bg-color-secondarycontainer-hover);
    border-color: var(--td-brand-color);
  }

  .dragIcon {
    margin-bottom: 12px;
  }

  .upload-text {
    color: var(--td-text-color-primary);
    font-size: 14px;
    margin: 0 0 8px;
  }

  .upload-hint {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
    margin: 0;
  }
}

.formItem {
  .label {
    color: var(--td-text-color-primary);
    font-weight: 500;
    margin-bottom: 8px;
  }
}

.footerInfo {
  color: var(--td-text-color-secondary);
  font-size: 12px;

  .charCount {
    color: var(--td-text-color-primary);
  }

  .tips.warn {
    color: var(--td-warning-color);
    margin-left: 8px;
  }
}

.ellipsis-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}

.selected-info {
  margin-top: 12px;
  color: var(--td-text-color-secondary);
  font-size: 14px;
}
</style>
