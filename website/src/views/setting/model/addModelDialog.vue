<template>
  <el-dialog v-model="showConfigModal" :title="configModalTitle" :close-on-click-modal="false" :footer="null" width="520px">
    <a-form :model="modelForm">
      <a-form-item label="模型名称">
        <a-select
          v-if="modelForm.manufacturer === 'chatgptOauth'"
          v-model:value="modelForm.model"
          show-search
          :filter-option="false"
          :options="chatgptOauthModels"
          placeholder="请选择可用模型（来自 OAuth Proxy）" />
        <a-input v-else v-model:value="modelForm.model" placeholder="请输入模型标识" />
      </a-form-item>
      <a-form-item label="Base URL" v-if="modelForm.manufacturer !== 'runninghub'">
        <a-input v-model:value="modelForm.baseUrl" :placeholder="props.defaultPlaceHolder" />
      </a-form-item>
      <a-form-item label="API Key" v-if="modelForm.manufacturer !== 'chatgptOauth'">
        <a-input-password v-model:value="modelForm.apiKey" placeholder="请输入 API Key" />
      </a-form-item>
      <a-form-item v-else>
        <a-alert type="info" show-icon message="ChatGPT OAuth 模式将自动使用本机登录凭据，无需手动填写 API Key" />
      </a-form-item>
      <a-form-item v-if="currentWebsite">
        <a :href="currentWebsite" target="_blank" rel="noopener noreferrer" style="font-size: 14px">
          点击获取 {{ manufacturerNames[modelForm.manufacturer] ?? modelForm.manufacturer }} API Key
        </a>
      </a-form-item>
      <a-form-item style="text-align: right; margin-bottom: 0">
        <a-button style="margin-right: 8px" @click="showConfigModal = false">取消</a-button>
        <a-button type="primary" @click="keep">保存</a-button>
      </a-form-item>
    </a-form>
  </el-dialog>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { ElMessage } from "element-plus";
import { computed } from "vue";
interface RowData {
  id: number;
  name?: string;
  type: string;
  modelType: string;
  model: string;
  baseUrl: string;
  manufacturer: string;
  createTime: number;
  apiKey: string;
}
const props = defineProps({
  currentWebsite: {
    type: String,
    default: "",
  },
  isCustomModel: {
    type: Boolean,
    default: false,
  },
  defaultPlaceHolder: {
    type: String,
    default: "",
  },
  manufacturerNames: {
    type: Object,
    default: {},
  },
  chatgptOauthModels: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["fetchModelList"]);
const showConfigModal = defineModel<boolean>({
  default: false,
});
const modelForm = defineModel<RowData>("modelForm", {
  default: () => ({
    manufacturer: "",
    model: "",
    baseUrl: "",
    apiKey: "",
    id: 0,
    type: "",
    modelType: "",
  }),
});
const chatgptOauthModels = computed(() => props.chatgptOauthModels as Array<{ label: string; value: string }>);

const configModalTitle = computed(() => {
  if (props.isCustomModel) {
    return "配置自定义模型";
  }
  return `配置 ${modelForm.value.model}`;
});
async function keep() {
  const { type, modelType, model, baseUrl, manufacturer, apiKey, id } = modelForm.value;
  const resolvedApiKey = manufacturer === "chatgptOauth" ? apiKey || "oauth-local" : apiKey;

  // 验证必填项
  if (!model) {
    ElMessage.error("请输入模型标识");
    return;
  }
  if (!resolvedApiKey) {
    ElMessage.error("请输入 API Key");
    return;
  }
  if ((manufacturer == "other" || manufacturer === "chatgptOauth") && baseUrl.trim() == "") {
    ElMessage.error("请输入 Base URL");
    return;
  }
  if (manufacturer === "chatgptOauth") {
    modelForm.value.apiKey = resolvedApiKey;
  }
  if (id == 0) {
    try {
      await axios.post("/setting/addModel", {
        modelType: modelType || "",
        type,
        model,
        baseUrl,
        manufacturer,
        apiKey: resolvedApiKey,
      });
      ElMessage.success("新增成功");
      emit("fetchModelList");
    } catch (e) {
      ElMessage.error("新增失败");
    }
  } else {
    try {
      await axios.post("/setting/updateModel", {
        id,
        type,
        modelType: modelType || "",
        model,
        baseUrl,
        manufacturer,
        apiKey: resolvedApiKey,
      });
      ElMessage.success("编辑成功");
      emit("fetchModelList");
    } catch (e) {
      ElMessage.error("编辑失败");
    }
  }

  showConfigModal.value = false; //关闭弹窗
}
</script>

<style lang="scss" scoped></style>
