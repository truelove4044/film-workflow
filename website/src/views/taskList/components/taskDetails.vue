<template>
  <div class="taskDetails">
    <a-modal v-model:open="openInner" title="任务详情" @ok="handleOk" :width="800" okText="保存">
      <div class="content">
        <!-- 左侧：图片区域 -->
        <div class="left" v-if="row && row.imageUrl?.length">
          <div class="imageGrid">
            <div class="imageDiv" v-for="(url, idx) in row.imageUrl" :key="idx">
              <a-image :src="url" :fallback="errorPictrue" width="220" height="150" style="object-fit: cover; border-radius: 8px" />
            </div>
          </div>
        </div>
        <!-- 右侧：失败原因 -->
        <div class="right">
          <div class="title">任务失败原因：</div>
          <ul class="reasonList">
            <li v-for="(reason, idx) in row?.errorReason" :key="idx">{{ reason }}</li>
          </ul>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import errorPictrue from "@/utils/error";

const props = defineProps<{
  open: boolean;
  row: any;
}>();

const emit = defineEmits(["update:open"]);

const openInner = ref(props.open);

watch(
  () => props.open,
  (val) => {
    openInner.value = val;
  },
);

watch(openInner, (val) => {
  emit("update:open", val);
});

function handleOk() {
  emit("update:open", false);
}
</script>

<style lang="scss" scoped>
.taskDetails {
  padding: 0 24px;
}

.content {
  display: flex;
  flex-direction: row;
  gap: 24px;
  min-height: 200px;
}

.left {
  flex: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  max-height: 500px;
  overflow: auto;

  .imageGrid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px; // 图片间距
  }

  .imageDiv {
    width: 220px;
    height: 150px;
    // background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    // box-shadow: 0 1px 4px rgba(150, 150, 150, 0.08);
    ::v-deep .ant-image-img {
      width: 220px !important;
      height: 150px !important;
      object-fit: cover !important;
      border-radius: 8px;
      display: block;
    }
  }
}

.right {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-width: 180px;
  background: #fafafa;
  border-radius: 8px;
  padding: 20px 16px;
  box-sizing: border-box;
  box-shadow: 0 1px 4px rgba(200, 200, 200, 0.05);

  .title {
    font-weight: 600;
    font-size: 16px;
    margin-bottom: 12px;
    color: #333;
  }

  .reasonList {
    padding-left: 18px;
    margin: 0;
    color: #da3535;
    font-size: 15px;

    li {
      margin-bottom: 6px;
      line-height: 1.6;
      list-style: disc;
    }
  }
}
</style>
