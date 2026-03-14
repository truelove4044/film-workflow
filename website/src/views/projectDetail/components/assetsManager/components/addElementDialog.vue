<template>
  <a-modal
    v-model:open="showModal"
    wrapClassName="noHeaderMargin"
    :footer="false"
    :width="640"
    dialogClass="customModal"
    :closable="false"
    :maskClosable="false">
    <template #title>
      <div class="ac jb titHeader" style="background: #f9faff; height: 60px; display: flex; width: 100%" v-if="formData">
        <div>
          <span style="font-weight: bold; font-size: 18px; margin-left: 24px">{{ formData.id ? "编辑" : "新建" }}{{ typeRecord[props.type] }}</span>
          <div style="margin-left: 24px">
            <span style="font-size: 14px">{{ formData.id ? "编辑" : "新建" }}元素信息和素材</span>
          </div>
        </div>
        <div class="closePoint" @click="editElementClose">
          <i-close theme="outline" size="18" fill="#9913FA" />
        </div>
      </div>
    </template>
    <div class="modelBody" style="max-height: 650px; overflow: auto" v-if="formData">
      <a-form ref="formRef" :model="formData" layout="vertical" style="margin-top: 14px">
        <!-- 名称 -->
        <a-form-item name="name" label="名称" required>
          <a-input v-model:value="formData.name" placeholder="例如：古代宫殿大殿" />
        </a-form-item>
        <!-- 主体描述 -->
        <a-form-item name="description" label="详情">
          <a-textarea v-model:value="formData.intro" placeholder="内容详情" :autoSize="{ minRows: 3, maxRows: 15 }" />
        </a-form-item>
        <a-form-item name="videoPrompt" label="视频提示词" v-if="props.type == 'storyboard'">
          <a-textarea v-model:value="formData.videoPrompt" placeholder="内容详情" :autoSize="{ minRows: 3, maxRows: 15 }" />
        </a-form-item>
        <!-- 备注 -->
        <a-form-item name="remark" label="备注">
          <a-input v-model:value="formData.remark" placeholder="添加备注信息..." />
        </a-form-item>
        <a-form-item v-if="props.type == 'storyboard'" name="duration" label="时长(单位：秒)">
          <a-input-number v-model:value="formData.duration" placeholder="时长" />
        </a-form-item>
      </a-form>
      <div class="footerBtns">
        <a-button @click="editElementClose" shape="round">取消</a-button>
        <a-button type="primary" shape="round" @click="handleSave" style="margin-left: 15px">保存</a-button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import store from "@/stores";
const { projectId } = storeToRefs(store());

import { message, type FormInstance } from "ant-design-vue";
const showModal = defineModel<boolean>({
  default: false,
});
const props = defineProps<{
  type: "role" | "scene" | "props" | "storyboard";
  data?: { id: number | null; imageUrl?: string; intro: string; name: string; prompt: string; remark: string; duration: number; videoPrompt: string };
  scriptId?: number;
}>();
const mode = ref("新增");
watch(showModal, (val) => {
  if (val) {
    formData.value = props.data;
    if (formData.value?.id == -1) {
      mode.value = "新增";
    } else {
      mode.value = "编辑";
    }
  }
});
const formRef = ref<FormInstance | null>(null);
const formData = ref<{
  id: number | null;
  imageUrl?: string;
  intro: string;
  name: string;
  prompt: string;
  remark: string;
  duration: number;
  videoPrompt: string;
}>();
const typeRecord = {
  role: "角色",
  scene: "场景",
  props: "道具",
  storyboard: "分镜",
} as const;
function editElementClose() {
  showModal.value = false;
}
const emits = defineEmits(["update"]);
// 保存校验
function handleSave() {
  formRef.value?.validate().then(async () => {
    try {
      if (!formData.value) return;
      if (formData.value.id) {
        const res = await axios.post("/assets/updateAssets", {
          id: formData.value.id,
          name: formData.value.name,
          intro: formData.value.intro ?? "",
          type: typeRecord[props.type],
          remark: formData.value.remark == null ? "" : formData.value.remark,
          prompt: formData.value.prompt ?? "",
          videoPrompt: formData.value.videoPrompt ?? "",
          duration: Number(formData.value.duration),
        });
      } else {
        const res = await axios.post("/assets/addAssets", {
          projectId: projectId.value,
          name: formData.value.name,
          intro: formData.value.intro,
          type: typeRecord[props.type],
          remark: formData.value.remark == null ? "" : formData.value.remark,
          prompt: "",
          videoPrompt: formData.value.videoPrompt ?? "",
          scriptId: props.type != "storyboard" ? undefined : Number(props.scriptId),
          duration: formData.value.duration,
        });
      }

      emits("update");
      showModal.value = false;
      message.success("保存成功");
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
  });
}
</script>

<style lang="scss" scoped>
.modelBody {
  padding: 0 24px;
  .typeSelectBox {
    display: flex;
    gap: 16px;
    .typeCard {
      flex: 1;
      text-align: center;
      background: #fff;
      border: 2px solid #dfdfee;
      border-radius: 14px;
      cursor: pointer;
      padding: 14px 0 10px 0;
      transition: all 0.18s;
      user-select: none;
      .active {
        border-color: #a874e8;
        background: #f7f1fe;
      }
      .tabSub {
        color: #795eb3;
        font-size: 13px;
        margin-top: 4px;
      }
      .tabMain {
        font-weight: 600;
        font-size: 17px;
        color: #8d37c9;
      }
      &:not(.active) .tabMain {
        color: #222;
      }
      &:not(.active) .tabSub {
        color: #444;
      }
    }
  }
  .elementPictureRow {
    display: flex;
    align-items: center;
    gap: 18px;
    .picturePreview {
      width: 132px;
      height: 132px;
      border: 1.5px dashed #dbdde7;
      border-radius: 14px;
      background: #f6f7fa;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      .elementImg {
        width: 130px;
        height: 130px;
        object-fit: cover;
        border-radius: 12px;
      }
    }
    .uploadSide {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      margin-left: 12px;
      .ant-btn {
        background: #f7f8fa;
        border: 1px solid #dbdde7;
        border-radius: 8px;
        color: #333;
      }
      .tipTxt {
        color: #669;
        font-size: 13px;
        margin-top: 6px;
      }
    }
  }
  .footerBtns {
    margin-top: 25px;
    margin-bottom: 25px;
    display: flex;
    justify-content: flex-end;
  }
}
.titHeader {
  .closePoint {
    cursor: pointer;
    margin-right: 24px;
  }
}
</style>
