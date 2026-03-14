<template>
  <div class="overviewMain">
    <div class="overviewHeader">
      <h2 class="overviewTitle">小说原文</h2>
      <p class="overviewSub">查看和管理项目中的章节原文</p>
    </div>

    <t-card :bordered="false" class="summaryCard">
      <div class="jb ac">
        <div class="f ac">
          <i-file-text :size="24" class="summaryIcon mr-3" />
          <span class="summaryTitle">原文管理</span>
        </div>
        <div class="actionGroup">
          <t-button v-if="selectedCount === 0" theme="danger" variant="outline" disabled>
            <template #icon><i-delete :size="16" /></template>
            全部删除
          </t-button>
          <t-popconfirm v-else :content="bulkDeleteConfirmText" @confirm="handleBulkDelete">
            <t-button theme="danger" variant="outline">
              <template #icon><i-delete :size="16" /></template>
              全部删除
            </t-button>
          </t-popconfirm>
          <t-button theme="primary" variant="outline" @click="purgeNovelShow = true">
            <template #icon><i-optimize :size="16" /></template>
            新增
          </t-button>
        </div>
      </div>
    </t-card>

    <t-table
      :data="originalList"
      :columns="columns"
      row-key="id"
      :selected-row-keys="selectedRowKeys"
      hover
      max-height="500"
      style="margin-top: 12px"
      @select-change="handleSelectionChange">
      <template #chapterData="{ row }">
        <t-tooltip :content="row.chapterData" placement="top">
          <span class="ellipsis-text">{{ row.chapterData }}</span>
        </t-tooltip>
      </template>
      <template #operation="{ row }">
        <div class="actionBtns">
          <t-link theme="primary" hover="color" @click="handleEdit(row)">
            <i-edit size="18" />
          </t-link>
          <t-popconfirm content="确定要删除这个章节吗？" @confirm="handleDelete(row)">
            <t-link theme="danger" hover="color">
              <i-delete size="18" />
            </t-link>
          </t-popconfirm>
        </div>
      </template>
    </t-table>

    <purgeNovel v-model="purgeNovelShow" @select="handleAddChapters" />

    <t-dialog placement="center" v-model:visible="editModal" header="编辑原文" width="60vw" @confirm="handleUpdate">
      <div class="editModalContent">
        <t-form :data="formData" layout="vertical">
          <t-form-item label="章节序号" name="index">
            <t-input-number v-model="formData.index" theme="normal" style="width: 100%" />
          </t-form-item>
          <t-form-item label="卷名" name="reel">
            <t-input v-model="formData.reel" />
          </t-form-item>
          <t-form-item label="章节名称" name="chapter">
            <t-input v-model="formData.chapter" />
          </t-form-item>
          <t-form-item label="章节内容" name="chapterData">
            <t-textarea v-model="formData.chapterData" :autosize="{ minRows: 5, maxRows: 20 }" />
          </t-form-item>
        </t-form>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { MessagePlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import purgeNovel from "./components/purgeNovel.vue";
import store from "@/stores";

const { projectId } = storeToRefs(store());

interface OriginalText {
  id: number;
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
}

interface ChapterItem {
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
}

type RowKey = string | number;

const columns = [
  { colKey: "row-select", type: "multiple" as const, width: 60 },
  { colKey: "index", title: "章节", width: 100 },
  { colKey: "reel", title: "卷名", width: 100 },
  { colKey: "chapter", title: "章节名称", width: 200, ellipsis: true },
  { colKey: "chapterData", title: "章节内容", ellipsis: true },
  { colKey: "operation", title: "操作", width: 100 },
];

const originalList = ref<OriginalText[]>([]);
const selectedRowKeys = ref<RowKey[]>([]);
const purgeNovelShow = ref(false);
const editModal = ref(false);
const formData = ref<OriginalText>({ id: -1, index: 0, reel: "", chapter: "", chapterData: "" });

const selectedCount = computed(() => selectedRowKeys.value.length);
const bulkDeleteConfirmText = computed(() => `确定要删除已勾选的 ${selectedCount.value} 个章节吗？`);

function syncSelectedRowKeys(rows: OriginalText[], preferredKeys: RowKey[] = selectedRowKeys.value) {
  const availableIds = new Set(rows.map((item) => item.id));
  selectedRowKeys.value = preferredKeys.filter((key) => availableIds.has(Number(key)));
}

async function getNovel(preferredKeys: RowKey[] = selectedRowKeys.value) {
  const res = await axios.post("/novel/getNovel", { projectId: projectId.value });
  originalList.value = res.data || [];
  syncSelectedRowKeys(originalList.value, preferredKeys);
}

function normalizeIncomingChapters(chapters: ChapterItem[]): ChapterItem[] {
  const usedIndexes = new Set<number>(
    originalList.value
      .map((item) => Number(item.index))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  const validExisting = Array.from(usedIndexes.values());
  let nextIndex = validExisting.length > 0 ? Math.max(...validExisting) + 1 : 1;

  return chapters.map((item) => {
    const preferred = Number(item.index);
    let index = preferred;

    if (!Number.isFinite(preferred) || preferred <= 0 || usedIndexes.has(preferred)) {
      while (usedIndexes.has(nextIndex)) {
        nextIndex += 1;
      }
      index = nextIndex;
      nextIndex += 1;
    }

    usedIndexes.add(index);
    return { ...item, index };
  });
}

async function handleAddChapters(chapters: ChapterItem[]) {
  const normalized = normalizeIncomingChapters(chapters);
  const res = await axios.post("/novel/addNovel", { projectId: projectId.value, data: normalized });
  await getNovel([]);
  purgeNovelShow.value = false;
  const message = (res as any)?.message ?? (res as any)?.data?.message ?? "新增原文成功";
  MessagePlugin.success(message);
}

function handleEdit(row: OriginalText) {
  formData.value = { ...row };
  editModal.value = true;
}

async function handleUpdate() {
  await axios.post("/novel/updateNovel", formData.value);
  await getNovel();
  MessagePlugin.success("更新成功");
  editModal.value = false;
}

async function handleDelete(row: OriginalText) {
  await axios.post("/novel/delNovel", { id: row.id });
  await getNovel(selectedRowKeys.value.filter((key) => Number(key) !== row.id));
  MessagePlugin.success("删除成功");
}

function handleSelectionChange(selectedKeys: RowKey[]) {
  selectedRowKeys.value = selectedKeys;
}

async function handleBulkDelete() {
  const ids = selectedRowKeys.value.map((key) => Number(key));
  if (!ids.length) {
    MessagePlugin.warning("请先勾选章节");
    return;
  }

  const results = await Promise.allSettled(ids.map((id) => axios.post("/novel/delNovel", { id })));
  const failedIds = ids.filter((_, index) => results[index].status === "rejected");
  const successCount = ids.length - failedIds.length;

  await getNovel(failedIds);

  if (failedIds.length === 0) {
    MessagePlugin.success(`已删除 ${successCount} 个章节`);
    return;
  }

  if (successCount === 0) {
    MessagePlugin.error("删除失败，请重试");
    return;
  }

  MessagePlugin.warning(`已删除 ${successCount} 个章节，${failedIds.length} 个删除失败`);
}

onMounted(() => {
  getNovel([]);
});
</script>

<style lang="scss" scoped>
.overviewHeader {
  margin-bottom: 32px;

  .overviewTitle {
    margin-bottom: 8px;
    font-size: 22px;
    font-weight: 600;
    color: var(--td-text-color-primary);
  }

  .overviewSub {
    color: var(--td-text-color-secondary);
  }
}

.summaryCard {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 0.75rem;

  .summaryIcon {
    color: var(--td-brand-color);
  }

  .summaryTitle {
    font-size: 1rem;
    font-weight: 600;
    color: var(--td-text-color-primary);
  }
}

.actionGroup {
  display: flex;
  gap: 12px;
  align-items: center;
}

.actionBtns {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-around;
}

.ellipsis-text {
  display: block;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editModalContent {
  max-height: 700px;
  overflow-y: auto;
}
</style>
