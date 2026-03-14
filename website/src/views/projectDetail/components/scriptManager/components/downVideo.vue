<template>
  <div class="batch-download">
    <!-- 头部区域 -->
    <div class="header">
      <div class="title">
        <div class="icon-wrapper">
          <i-download :size="20" class="icon" />
        </div>
        <span>批量下载</span>
        <span v-if="downloadableCount" class="count-badge">{{ downloadableCount }} 个可下载</span>
      </div>
      <button @click="down" :disabled="!hasDownloadableVideos" class="download-btn">
        <i-check-correct :size="18" />
        <span>选择视频</span>
      </button>
    </div>

    <!-- 选择弹窗 -->
    <a-modal v-model:open="visible" :title="null" width="85vw" centered :footer="null" wrapClassName="download-modal">
      <div class="modal-content">
        <!-- 弹窗头部 -->
        <div class="modal-header">
          <div class="modal-title">
            <i-video-two :size="24" />
            <span>选择要下载的视频</span>
          </div>
          <button class="close-btn" @click="visible = false">
            <i-close :size="20" />
          </button>
        </div>

        <!-- 操作栏 -->
        <div class="action-bar">
          <div class="select-info">
            <div class="info-left">
              <span class="select-count">
                已选择
                <strong>{{ selectedKeys.length }}</strong>
                / {{ videoData.length }}
              </span>
              <span v-if="selectedKeys.length > 0" class="selected-hint">(共 {{ formatFileSize(estimatedSize) }})</span>
            </div>
            <div class="info-right">
              <button class="select-all-btn" @click="toggleSelectAll">
                <i-check-correct v-if="!isAllSelected" :size="16" />
                <i-close-one v-else :size="16" />
                {{ isAllSelected ? "取消全选" : "全选" }}
              </button>
            </div>
          </div>
        </div>

        <!-- 视频列表 -->
        <div class="video-list">
          <div v-if="videoData.length" class="video-grid">
            <div
              v-for="(item, index) in videoData"
              :key="item.id"
              :class="['video-card', { selected: isSelected(item.id), disabled: !item.filePath }]"
              @click="item.filePath && toggleSelect(item.id)">
              <!-- 选中标记 -->
              <div class="select-indicator" v-if="isSelected(item.id)">
                <i-check :size="16" />
              </div>

              <!-- 不可用标记 -->
              <div class="unavailable-badge" v-if="!item.filePath">不可用</div>

              <!-- 缩略图 -->
              <div class="thumb-wrapper">
                <img :src="item.firstFrame" alt="视频封面" class="video-thumb" @error="handleImageError" />
                <div class="thumb-overlay">
                  <div class="play-icon">
                    <i-play :size="24" />
                  </div>
                </div>
              </div>

              <!-- 视频信息 -->
              <div class="video-info">
                <h4 class="video-title">视频 #{{ index + 1 }}</h4>
                <div class="video-meta">
                  <span class="meta-tag resolution">
                    <i-pic :size="12" />
                    {{ item.resolution || "未知" }}
                  </span>
                  <span class="meta-tag model">
                    <i-cpu :size="12" />
                    {{ item.model || "未知" }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="empty-state">
            <div class="empty-icon">
              <i-video-two :size="48" />
            </div>
            <p class="empty-title">暂无视频</p>
            <p class="empty-desc">没有可供下载的视频</p>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="modal-footer">
          <button class="cancel-btn" @click="visible = false">取消</button>
          <button class="confirm-btn" :disabled="selectedKeys.length === 0" @click="handleDownload">
            <i-download :size="18" />
            <span>下载选中项 ({{ selectedKeys.length }})</span>
          </button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { message } from "ant-design-vue";
import JSZip from "jszip";

interface VideoData {
  id: number;
  time: number;
  model: string;
  scriptId: number;
  resolution: string;
  prompt: string;
  storyboardImgs: string[];
  firstFrame: string;
  filePath: string;
  state: 0 | -1 | 1;
}

const videoData = defineModel<VideoData[]>({ default: [] });

const visible = ref(false);
const selectedKeys = ref<number[]>([]);

const hasDownloadableVideos = computed(() => videoData.value.some((v) => v.filePath));
const downloadableCount = computed(() => videoData.value.filter((v) => v.filePath).length);
const isAllSelected = computed(() => {
  const downloadable = videoData.value.filter((v) => v.filePath);
  return selectedKeys.value.length === downloadable.length && downloadable.length > 0;
});

// 估算文件大小（假设每个视频约 5MB）
const estimatedSize = computed(() => selectedKeys.value.length * 5 * 1024 * 1024);

const isSelected = (id: number) => selectedKeys.value.includes(id);

const toggleSelect = (id: number) => {
  const index = selectedKeys.value.indexOf(id);
  if (index > -1) {
    selectedKeys.value.splice(index, 1);
  } else {
    selectedKeys.value.push(id);
  }
};

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedKeys.value = [];
  } else {
    selectedKeys.value = videoData.value.filter((v) => v.filePath).map((v) => v.id);
  }
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function down() {
  visible.value = true;
  selectedKeys.value = videoData.value.filter((v) => v.filePath).map((v) => v.id);
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("文件无法访问");

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    }, 100);
  } catch (error) {
    console.error("下载失败:", error);
    throw error;
  }
}

async function handleDownload() {
  if (selectedKeys.value.length === 0) {
    message.warning("请至少选择一个视频");
    return;
  }

  const selectedVideos = videoData.value.filter((v) => selectedKeys.value.includes(v.id) && v.filePath);

  if (selectedVideos.length === 0) {
    message.warning("选中的视频没有可下载的文件");
    return;
  }

  const loadingKey = "download";
  message.loading({
    content: `正在打包 ${selectedVideos.length} 个视频...`,
    key: loadingKey,
    duration: 0,
  });

  try {
    const zip = new JSZip();

    // 下载所有视频并添加到压缩包
    for (let i = 0; i < selectedVideos.length; i++) {
      const video = selectedVideos[i];
      const videoIndex = videoData.value.findIndex((v) => v.id === video.id) + 1;
      const filename = `视频_${videoIndex}.mp4`;

      message.loading({
        content: `正在处理 ${i + 1}/${selectedVideos.length}: ${filename}`,
        key: loadingKey,
        duration: 0,
      });

      try {
        const response = await fetch(video.filePath);
        if (!response.ok) throw new Error(`无法获取视频: ${filename}`);

        const blob = await response.blob();
        zip.file(filename, blob);
      } catch (error) {
        console.error(`下载视频失败: ${filename}`, error);
        // 继续处理其他视频
      }
    }

    // 生成压缩包
    message.loading({
      content: "正在生成压缩包...",
      key: loadingKey,
      duration: 0,
    });

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });

    // 下载压缩包
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `下载视频_${new Date().getTime()}.zip`;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    }, 100);

    message.success({ content: "下载完成!", key: loadingKey });
    visible.value = false;
  } catch (error) {
    console.error("打包下载错误:", error);
    message.error({ content: "打包失败,请重试", key: loadingKey });
  }
}

function handleImageError(e: Event) {
  (e.target as HTMLImageElement).src = "/default-thumb.png";
}
</script>

<style lang="scss" scoped>
.batch-download {
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    margin-top: 20px;
    background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #f0fdfa 100%);
    border-radius: 16px;
    border: 1px solid rgba(16, 185, 129, 0.15);

    .title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      font-size: 16px;
      color: #1f2937;

      .icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #10b981, #059669);
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);

        .icon {
          color: #fff;
        }
      }

      .count-badge {
        padding: 2px 10px;
        background: rgba(16, 185, 129, 0.1);
        color: #059669;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
      }
    }

    .download-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
      }

      &:disabled {
        background: #d1d5db;
        box-shadow: none;
        cursor: not-allowed;
      }
    }
  }
}

.modal-content {
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #f3f4f6;

    .modal-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: #f3f4f6;
      border: none;
      border-radius: 10px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #e5e7eb;
        color: #1f2937;
      }
    }
  }

  .action-bar {
    padding: 16px 24px;
    background: #f9fafb;
    border-bottom: 1px solid #f3f4f6;

    .select-info {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .info-left {
        display: flex;
        align-items: center;
        gap: 12px;

        .select-count {
          font-size: 14px;
          color: #6b7280;

          strong {
            color: #10b981;
            font-size: 16px;
          }
        }

        .selected-hint {
          font-size: 13px;
          color: #9ca3af;
        }
      }

      .select-all-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #374151;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          border-color: #10b981;
          color: #10b981;
        }
      }
    }
  }

  .video-list {
    padding: 24px;
    max-height: 55vh;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: #f3f4f6;
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;

      &:hover {
        background: #9ca3af;
      }
    }

    .video-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 20px;
    }

    .video-card {
      position: relative;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid #f3f4f6;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

      &:hover:not(.disabled) {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);

        .thumb-overlay {
          opacity: 1;
        }
      }

      &.selected {
        border-color: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);

        .select-indicator {
          opacity: 1;
          transform: scale(1);
        }
      }

      &.disabled {
        opacity: 0.6;
        cursor: not-allowed;

        .thumb-wrapper::after {
          content: "";
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
        }
      }

      .select-indicator {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 10;
        width: 28px;
        height: 28px;
        background: #10b981;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        opacity: 0;
        transform: scale(0.5);
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
      }

      .unavailable-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 10;
        padding: 4px 10px;
        background: rgba(239, 68, 68, 0.9);
        color: #fff;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
      }

      .thumb-wrapper {
        position: relative;
        width: 100%;
        height: 140px;
        overflow: hidden;
        background: linear-gradient(135deg, #f3f4f6, #e5e7eb);

        .video-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }

        .thumb-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;

          .play-icon {
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #10b981;
          }
        }
      }

      .video-info {
        padding: 14px;

        .video-title {
          margin: 0 0 10px;
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }

        .video-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;

          .meta-tag {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;

            &.resolution {
              background: #ecfdf5;
              color: #059669;
            }

            &.model {
              background: #eff6ff;
              color: #2563eb;
            }
          }
        }
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;

      .empty-icon {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #ecfdf5, #d1fae5);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #10b981;
        margin-bottom: 20px;
      }

      .empty-title {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 600;
        color: #374151;
      }

      .empty-desc {
        margin: 0;
        font-size: 14px;
        color: #9ca3af;
      }
    }
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid #f3f4f6;
    background: #f9fafb;

    .cancel-btn {
      padding: 10px 24px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #f3f4f6;
        color: #374151;
      }
    }

    .confirm-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
      }

      &:disabled {
        background: #d1d5db;
        box-shadow: none;
        cursor: not-allowed;
      }
    }
  }
}
</style>

<style lang="scss">
.download-modal {
  .ant-modal-content {
    padding: 0;
    border-radius: 20px;
    overflow: hidden;
  }

  .ant-modal-body {
    padding: 0;
  }

  .ant-modal-close {
    display: none;
  }
}
</style>
