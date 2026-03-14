<template>
  <div class="scriptManager">
    <div class="smHead jb ac">
      <div>
        <h2 class="smTitle">剧本管理</h2>
        <p class="smSub">管理和编辑分集剧本内容</p>
      </div>
    </div>

    <div class="data">
      <!-- 剧本列表 -->
      <div class="newStoryboard">
        <div v-if="scripts.length === 0" class="noneScripts">
          <div class="smNoneIcon">
            <i-file-text :size="48" class="icon" />
          </div>
          <h3 class="smNoneTitle">暂无剧本</h3>
        </div>
        <div v-else class="scriptsList">
          <scriptView v-model="scripts" v-model:scriptId="selectScriptId" @getScriptData="getScriptData" @change="handleScriptChange" />
        </div>
      </div>
      <!-- 分镜图 - 前提是剧本必须存在 -->
      <div class="storyboardImage" v-show="scripts.length > 0 && currentScriptHasContent">
        <storyboardImage
          :data="storyboardData"
          :disableBtn="scripts.length"
          :canGenerate="currentScriptHasContent"
          :scriptId="selectScriptId"
          :projectId="projectId"
          @save="getStoryboardData(currentScriptId)" />
      </div>

      <!-- 视频配置卡片 - 必须有分镜图 -->
      <div class="storyboardImage" v-show="scripts.length > 0 && storyboardData.length > 0">
        <generateVideo :disableBtn="isDisBtnFlag" :canGenerate="currentScriptHasContent" :scriptId="selectScriptId" />
      </div>

      <!-- 批量下载 - 必须有视频卡片（已选择的视频结果） -->
      <div v-show="storyboardData.length > 0 && selectedVideoResults.length > 0" class="storyboardImage">
        <downVideo v-model="selectedVideoResults" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { message } from "ant-design-vue";
import axios from "@/utils/axios";
import scriptView from "./components/scriptView.vue";
import storyboardImage from "./components/storyboardImage.vue";
import generateVideo from "./components/generateVideo.vue";
import downVideo from "./components/downVideo.vue";
import store from "@/stores";
import videoStore from "@/stores/video";

const { project, currentScriptId } = storeToRefs(store());
const videoStoreInstance = videoStore();
const { currentConfigs } = storeToRefs(videoStoreInstance);

interface Scripts {
  id: number;
  name: string;
  content: string;
  outlineId: number;
  element: {
    id: number;
    intro: string;
    prompt: string;
    name: string;
    filePath: string;
    type: string;
    image: string;
    remark: string;
    duration: number;
    videoPrompt: string;
  }[];
}
const scripts = ref<Scripts[]>([]);
const storyboardData = ref([]);
const selectScriptId = ref(-1);

// 获取所有已选择的视频结果（用于批量下载）
const selectedVideoResults = computed(() => {
  return currentConfigs.value
    .filter((config) => config.selectedResultId)
    .map((config) => {
      const result = videoStoreInstance.getSelectedResult(config.id);
      if (!result) return null;
      return {
        id: result.id,
        filePath: result.filePath,
        firstFrame: result.firstFrame,
        duration: result.duration,
        prompt: result.prompt,
        state: result.state,
        // 兼容 downVideo 组件可能需要的字段
        time: result.duration,
        model: "",
        scriptId: config.scriptId,
        resolution: config.resolution,
        storyboardImgs: [] as string[],
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
});

const projectId = computed(() => Number(project.value?.id));

const currentScriptHasContent = computed(() => {
  const script = scripts.value.find((item) => item.id === currentScriptId.value);
  return (script?.content?.length ?? 0) > 0;
});

const isDisBtnFlag = computed(() => {
  if (!scripts.value.length) return false;
  const script = scripts.value.find((i) => i.id === selectScriptId.value);
  return !!script?.content;
});

function handleScriptChange(scriptId: number | undefined) {
  if (scriptId === undefined) return;
  currentScriptId.value = scriptId;
  getStoryboardData(scriptId);
  // 使用 store 管理视频数据
  videoStoreInstance.setCurrentScript(scriptId, projectId.value);
}

async function getScriptData() {
  try {
    const { data } = await axios.post("/script/geScriptApi", { projectId: projectId.value });
    scripts.value = data;
  } catch {
    message.error("获取剧本列表失败");
  }
}

async function getStoryboardData(scriptId: number | null) {
  if (scriptId === -1) return;
  const { data } = await axios.post("/storyboard/getStoryboard", {
    projectId: projectId.value,
    scriptId,
  });
  storyboardData.value = data;
}

onBeforeUnmount(() => {
  // 清理 video store 的轮询
  videoStoreInstance.cleanup();
});

onMounted(getScriptData);
</script>

<style lang="scss" scoped>
.scriptManager {
  .smHead {
    .smTitle {
      font-size: 22px;
      font-weight: 600;
      color: #222;
      margin-bottom: 8px;
    }

    .smSub {
      color: #888;
      font-size: 15px;
    }
  }

  .data {
    display: flex;
    flex-direction: column;

    .newStoryboard {
      margin-bottom: 1rem;

      .noneScripts {
        height: 400px;
        text-align: center;
        padding: 4rem 0;
        background: #fff;
        border-radius: 0.75rem;
        border: 1px solid #e5e7eb;
        margin: 0 auto 1rem;

        .smNoneIcon {
          width: 6rem;
          height: 6rem;
          background: #f3f4f6;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;

          .icon {
            color: #d1d5db;
          }
        }

        .smNoneTitle {
          font-size: 17px;
          font-weight: 500;
          color: #18181b;
          margin-bottom: 8px;
        }
      }
    }
  }
}
</style>
