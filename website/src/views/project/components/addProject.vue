<template>
  <div class="addProject">
    <a-modal v-model:open="addProjectShow" title="新建项目" @ok="handleOk">
      <div class="data">
        <a-form :model="formState">
          <a-form-item label="项目名称">
            <a-input v-model:value="formState.name" />
          </a-form-item>
          <a-form-item label="小说类型">
            <a-input v-model:value="formState.type" placeholder="例如：玄幻、科幻、言情" />
          </a-form-item>
          <a-form-item label="时代画风">
            <a-input v-model:value="formState.artStyle" placeholder="例如：中国古风玄幻修仙CG风格、现代都市2D动漫风格" />
          </a-form-item>
          <!-- <a-form-item label="年代">
            <a-input v-model:value="formState.era" />
          </a-form-item> -->
          <a-form-item label="影片比例">
            <a-select v-model:value="formState.videoRatio" :options="options" />
          </a-form-item>
          <a-form-item label="小说简介">
            <a-textarea v-model:value="formState.intro" :rows="20" style="width: 100%" :autoSize="{ minRows: 3, maxRows: 10 }"></a-textarea>
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import axios from "@/utils/axios";
import { message } from "ant-design-vue";
const addProjectShow = defineModel<boolean>();
interface FormState {
  id: number;
  name: string;
  era: string;
  intro: string;
  type: string;
  artStyle: string;
  videoRatio: string;
  createTime: number;
  userId: number;
}
const formState = ref<FormState>({
  id: 0,
  name: "",
  intro: "",
  type: "",
  artStyle: "",
  era: "",
  videoRatio: "",
  createTime: 0,
  userId: 0,
});
const emit = defineEmits(["getProjects"]);
const options = ref([
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  // { value: "1:1", label: "1:1" },
  // { value: "4:3", label: "4:3" },
  // { value: "3:4", label: "3:4" },
  // { value: "21:9", label: "21:9" },
]);
function handleOk() {
  axios
    .post("/project/addProject", {
      name: formState.value.name ? formState.value.name : "名称",
      intro: formState.value.intro ? formState.value.intro : "这个是一条小说简介",
      type: formState.value.type ? formState.value.type : "玄幻",
      artStyle: formState.value.artStyle ? formState.value.artStyle : "动漫",
      videoRatio: formState.value.videoRatio ? formState.value.videoRatio : "16:9",
      // era: formState.value.era ? formState.value.era : "现代",
    })
    .then(({ data }) => {
      message.success(`新增项目成功`);
      emit("getProjects");
      addProjectShow.value = false;
    })
    .catch(() => {
      message.error(`新增项目失败`);
    })
    .finally(() => {});
}
</script>

<style lang="scss" scoped></style>
