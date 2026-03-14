import axios from "@/utils/axios";
import { ref, computed, watch, nextTick } from "vue";

// 图片项
export interface ImageItem {
  id: number;
  filePath: string;
  prompt: string;
}

// 视频配置 - 用户创建的配置
export interface VideoConfig {
  id: number;
  scriptId: number;
  projectId: number;
  model: string;
  aiConfigId: number | undefined;
  manufacturer: string;
  mode: "startEnd" | "multi" | "single" | "text";
  startFrame: ImageItem | null;
  endFrame: ImageItem | null;
  images: ImageItem[];
  resolution: string;
  duration: number;
  prompt: string;
  selectedResultId: number | null; // 选中的生成结果ID
  createdAt: string;
  audioEnabled: boolean;
}

// 视频生成结果
export interface VideoResult {
  id: number;
  configId: number; // 关联的配置ID
  state: 0 | 1 | -1; // 生成中/成功/失败
  filePath: string;
  firstFrame: string;
  duration: number;
  prompt: string;
  createdAt: string;
  errorReason?: string;
}

export default defineStore(
  "video",
  () => {
    // 配置列表
    const videoConfigs = ref<VideoConfig[]>([]);
    // 生成结果列表
    const videoResults = ref<VideoResult[]>([]);
    // 当前脚本ID
    const currentScriptId = ref<number | null>(null);
    // 当前项目ID
    const currentProjectId = ref<number | null>(null);
    // 轮询定时器
    let pollingTimer: number | null = null;
    // 配置ID计数器
    let configIdCounter = 0;

    // 获取当前脚本的配置列表
    const currentConfigs = computed(() => {
      if (!currentScriptId.value) return [];
      return videoConfigs.value.filter((c) => c.scriptId === currentScriptId.value);
    });

    // 获取待轮询的结果ID列表（state === 0）
    const pendingResultIds = computed(() => {
      return videoResults.value.filter((r) => r.state === 0).map((r) => r.id);
    });

    // 根据配置ID获取其所有生成结果
    function getResultsByConfigId(configId: number): VideoResult[] {
      return videoResults.value.filter((r) => r.configId === configId);
    }

    // 获取配置的选中结果
    function getSelectedResult(configId: number): VideoResult | null {
      const config = videoConfigs.value.find((c) => c.id === configId);
      if (!config || !config.selectedResultId) return null;
      return videoResults.value.find((r) => r.id === config.selectedResultId) || null;
    }

    // 设置当前脚本ID并加载数据
    async function setCurrentScript(scriptId: number, projectId: number) {
      currentScriptId.value = scriptId;
      currentProjectId.value = projectId;
      // 同时获取视频配置和视频生成结果
      await Promise.all([fetchVideoConfigs(scriptId), fetchVideoData(scriptId)]);
    }

    // 从后端获取视频数据（视频生成结果）
    async function fetchVideoData(scriptId: number, specifyIds: number[] = []) {
      try {
        const reqBodyObj = {
          scriptId: scriptId,
          specifyIds: specifyIds,
        };
        const { data } = await axios.post("/video/getVideo", reqBodyObj);

        if (specifyIds.length > 0) {
          // 部分更新：只更新指定ID的结果状态
          if (data.length === 0) return;
          // 创建新数组以触发响应式更新
          const updatedResults = videoResults.value.map((r) => {
            const updated = data.find((item: any) => item.id === r.id);
            if (updated) {
              return {
                ...r,
                state: updated.state,
                filePath: updated.filePath || r.filePath,
                firstFrame: updated.firstFrame || r.firstFrame,
                duration: updated.duration || r.duration,
                errorReason: updated.errorReason || r.errorReason,
              };
            }
            return r;
          });
          videoResults.value = updatedResults;
        } else {
          // 全量更新：解析后端数据，转换为结果列表
          // 只处理视频结果，不再重建配置（配置从 fetchVideoConfigs 获取）
          parseVideoResults(data, scriptId);
        }
      } catch (error) {
        console.error("获取视频数据失败:", error);
      }
    }

    // 解析后端视频数据为结果列表（不再重建配置）
    function parseVideoResults(data: any[], scriptId: number) {
      // 获取当前脚本的所有配置ID
      const scriptConfigIds = videoConfigs.value.filter((c) => c.scriptId === scriptId).map((c) => c.id);

      // 清空当前脚本配置关联的旧结果
      videoResults.value = videoResults.value.filter((r) => !scriptConfigIds.includes(r.configId));

      // 添加新的结果
      const newResults: VideoResult[] = data.map((item: any) => ({
        id: item.id,
        configId: item.configId || 0, // 后端应该返回 configId
        state: item.state,
        filePath: item.filePath || "",
        firstFrame: item.firstFrame || "",
        duration: item.duration || item.time || 0,
        prompt: item.prompt || "",
        createdAt: new Date().toISOString(),
        errorReason: item.errorReason || "",
      }));

      // 按ID升序排序，新的在后面
      newResults.sort((a, b) => a.id - b.id);

      videoResults.value = [...videoResults.value, ...newResults];
    }

    // 从后端获取视频配置列表
    async function fetchVideoConfigs(scriptId: number) {
      try {
        const { data } = await axios.post("/video/getVideoConfigs", { scriptId });
        if (data && Array.isArray(data)) {
          // 过滤掉当前脚本的旧配置
          videoConfigs.value = [];
          // 添加从后端获取的配置
          data.forEach((item: any) => {
            const config: VideoConfig = {
              id: item.id,
              scriptId: item.scriptId,
              projectId: item.projectId,
              model: item.model,
              aiConfigId: item.aiConfigId,
              manufacturer: item.manufacturer,
              mode: item.mode,
              startFrame: item.startFrame,
              endFrame: item.endFrame,
              images: item.images || [],
              resolution: item.resolution,
              duration: item.duration,
              prompt: item.prompt || "",
              selectedResultId: item.selectedResultId,
              createdAt: item.createdAt || new Date().toISOString(),
              audioEnabled: item.audioEnabled,
            };
            videoConfigs.value.push(config);

            // 更新configIdCounter
            if (config.id > configIdCounter) {
              configIdCounter = config.id;
            }
          });
        }
      } catch (error) {
        console.error("获取视频配置失败:", error);
      }
    }

    // 从后端返回的数据添加配置（用于新增配置后）
    function addConfigFromBackend(configData: any): VideoConfig {
      const newConfig: VideoConfig = {
        id: configData.id,
        scriptId: configData.scriptId,
        projectId: configData.projectId,
        model: configData.model,
        aiConfigId: configData.aiConfigId,
        manufacturer: configData.manufacturer,
        mode: configData.mode,
        startFrame: configData.startFrame || null,
        endFrame: configData.endFrame || null,
        images: configData.images || [],
        resolution: configData.resolution,
        duration: configData.duration,
        prompt: configData.prompt || "",
        selectedResultId: configData.selectedResultId || null,
        createdAt: configData.createdAt || new Date().toISOString(),
        audioEnabled: configData.audioEnabled,
      };
      videoConfigs.value.unshift(newConfig);

      // 更新configIdCounter
      if (newConfig.id > configIdCounter) {
        configIdCounter = newConfig.id;
      }

      return newConfig;
    }

    // 添加新配置（本地，仅用于临时操作）
    function addConfig(configData: Omit<VideoConfig, "id" | "createdAt" | "selectedResultId">): VideoConfig {
      const newConfig: VideoConfig = {
        ...configData,
        // 确保图片字段有默认值
        startFrame: configData.startFrame || null,
        endFrame: configData.endFrame || null,
        images: configData.images || [],
        id: ++configIdCounter,
        selectedResultId: null,
        createdAt: new Date().toISOString(),
      };
      videoConfigs.value.push(newConfig);
      return newConfig;
    }

    // 删除配置
    async function removeConfig(configId: number) {
      // 调用后端接口删除配置（包括文件和视频）
      try {
        await axios.post("/video/deleteVideoConfig", { id: configId });
      } catch (error) {
        console.error("删除配置失败:", error);
        throw error;
      }

      // 删除本地 store 中的数据
      const index = videoConfigs.value.findIndex((c) => c.id === configId);
      if (index !== -1) {
        videoConfigs.value.splice(index, 1);
        // 同时删除关联的结果
        videoResults.value = videoResults.value.filter((r) => r.configId !== configId);
      }
    }

    // 生成视频（单个配置）
    async function generateVideo(configId: number): Promise<void> {
      const config = videoConfigs.value.find((c) => c.id === configId);

      if (!config) {
        throw new Error("配置不存在");
      }

      // 构建图片路径列表
      const videoImgs: string[] = [];
      if (config.mode === "startEnd") {
        if (config.startFrame) videoImgs.push(config.startFrame.filePath);
        if (config.endFrame) videoImgs.push(config.endFrame.filePath);
      } else if (config.mode === "single") {
        if (config.startFrame) videoImgs.push(config.startFrame.filePath);
      } else if (config.mode == "text") {
        videoImgs.length = 0;
      } else {
        config.images.forEach((img) => videoImgs.push(img.filePath));
      }
      // 调用后端接口
      const { data } = await axios.post("/video/generateVideo", {
        projectId: config.projectId,
        scriptId: config.scriptId,
        mode: config.mode,
        aiConfigId: config.aiConfigId,
        configId: configId, // 关联配置ID
        resolution: config.resolution,
        filePath: videoImgs,
        duration: config.duration,
        prompt: config.prompt,
        audioEnabled: config.audioEnabled,
      });

      // 添加新的结果到列表（使用后端返回的真实 ID）
      if (data && data.id) {
        const newResult: VideoResult = {
          id: data.id,
          configId: configId,
          state: 0, // 生成中
          filePath: "",
          firstFrame: "",
          duration: config.duration,
          prompt: config.prompt,
          createdAt: new Date().toISOString(),
        };
        // 使用展开运算符创建新数组，确保触发响应式更新
        videoResults.value = [...videoResults.value, newResult];

        // 强制开始轮询，确保新添加的结果能被轮询到
        startPolling(true);
      }
    }

    // 选择一个结果作为最终选择
    function selectResult(configId: number, resultId: number) {
      const config = videoConfigs.value.find((c) => c.id === configId);
      if (config) {
        config.selectedResultId = resultId;
      }
    }

    // 更新配置（仅基础字段）
    function updateConfig(configId: number, updates: Partial<Pick<VideoConfig, "prompt" | "resolution" | "duration">>) {
      const config = videoConfigs.value.find((c) => c.id === configId);
      if (config) {
        if (updates.prompt !== undefined) config.prompt = updates.prompt;
        if (updates.resolution !== undefined) config.resolution = updates.resolution;
        if (updates.duration !== undefined) config.duration = updates.duration;
      }
    }

    // 更新配置（包括图片字段）
    function updateConfigFull(
      configId: number,
      updates: Partial<Pick<VideoConfig, "prompt" | "resolution" | "duration" | "startFrame" | "endFrame" | "images" | "mode" | "audioEnabled">>,
    ) {
      console.log("%c Line:338 🍐 updates", "background:#465975", updates);

      const config = videoConfigs.value.find((c) => c.id === configId);
      console.log("%c Line:342 🌰 config", "background:#fca650", config);
      if (config) {
        if (updates.prompt !== undefined) config.prompt = updates.prompt;
        if (updates.resolution !== undefined) config.resolution = updates.resolution;
        if (updates.duration !== undefined) config.duration = updates.duration;
        if (updates.startFrame !== undefined) config.startFrame = updates.startFrame;
        if (updates.endFrame !== undefined) config.endFrame = updates.endFrame;
        if (updates.images !== undefined) config.images = [...updates.images];
        if (updates.mode !== undefined) config.mode = updates.mode;
        if (updates.audioEnabled !== undefined) config.audioEnabled = updates.audioEnabled;
      }
    }

    // 开始轮询
    function startPolling(force: boolean = false) {
      if (pollingTimer) {
        // 如果已有定时器且不是强制启动，直接返回
        if (!force) return;
        // 强制启动时，先停止旧的定时器
        stopPolling();
      }

      // 使用 nextTick 确保 computed 属性已更新
      nextTick(() => {
        if (pendingResultIds.value.length === 0) return;

        pollingTimer = window.setInterval(async () => {
          if (pendingResultIds.value.length === 0) {
            stopPolling();
            return;
          }
          if (currentScriptId.value) {
            await fetchVideoData(currentScriptId.value, pendingResultIds.value);
          }
        }, 10000);
      });
    }

    // 停止轮询
    function stopPolling() {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    }

    // 监听待处理结果变化，自动开始/停止轮询
    watch(pendingResultIds, (newVal) => {
      if (newVal.length > 0) {
        startPolling();
      } else {
        stopPolling();
      }
    });

    // 清理
    function cleanup() {
      stopPolling();
    }

    return {
      // 状态
      videoConfigs,
      videoResults,
      currentScriptId,
      currentProjectId,
      currentConfigs,
      pendingResultIds,
      // 方法
      setCurrentScript,
      fetchVideoData,
      fetchVideoConfigs,
      addConfig,
      addConfigFromBackend,
      removeConfig,
      updateConfig,
      updateConfigFull,
      generateVideo,
      selectResult,
      getResultsByConfigId,
      getSelectedResult,
      startPolling,
      stopPolling,
      cleanup,
    };
  },
  { persist: false },
);
