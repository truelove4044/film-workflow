<template>
  <div class="chat-container">
    <el-scrollbar class="message-area" ref="boxRef" @scroll="handleScroll">
      <div ref="innerRef" class="message-list">
        <TransitionGroup name="message">
          <div v-for="(item, index) in message" :key="index" class="message-item">
            <chatMessage :sendApi="sendApi" :msg="item" />
          </div>
        </TransitionGroup>
      </div>
    </el-scrollbar>

    <div class="input-container">
      <div class="input-wrapper" ref="msgInput">
        <a-mentions
          v-if="props.options && props.options.length"
          v-model:value="inputMsg"
          @focus="enableEnterSend"
          @blur="disableEnterSend"
          class="message-input"
          placeholder="输入 @ 选择图片进行编辑，单次限一张"
          autofocus
          :options="props.options" />
        <textarea
          v-else
          spellcheck="false"
          class="message-input"
          v-model="inputMsg"
          placeholder="输入消息..."
          @focus="enableEnterSend"
          @blur="disableEnterSend" />
      </div>

      <div class="action-bar">
        <div class="action-left">
          <a-popconfirm
            v-if="props.showClearBtn"
            title="确定清空所有对话记录？"
            ok-text="确定"
            cancel-text="取消"
            @confirm="cleanHistory"
            placement="topLeft">
            <a-tooltip title="清空对话">
              <button class="action-btn danger">
                <i-clear-format theme="outline" size="20" />
              </button>
            </a-tooltip>
          </a-popconfirm>
        </div>
        <a-tooltip :title="props.canSend ? '发送消息' : '请等待响应完成'">
          <button class="send-btn" :class="{ disabled: !props.canSend }" :disabled="!props.canSend" @click="throttleSendMsg">
            <i-arrow-circle-up theme="outline" size="24" fill="#fff" />
          </button>
        </a-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ScrollbarInstance } from "element-plus";
import throttle from "@/utils/throttle";
import chatMessage from "./chatMessage.vue";
import { message as antMessage } from "ant-design-vue";
import "./type.d.ts";

const msgInput = ref<HTMLTextAreaElement | null>(null);
const message = defineModel<ChatMessage[]>({ default: [] });

const props = withDefaults(
  defineProps<{
    sendApi: (msg: string) => Promise<void>;
    options?: { label: string; value: string }[];
    showClearBtn?: boolean;
    canSend?: boolean;
    enterToSend?: boolean;
    autoScroll?: boolean;
  }>(),
  {
    options: () => [],
    showClearBtn: false,
    canSend: true,
    enterToSend: true,
    autoScroll: false,
  },
);

const emit = defineEmits(["clean"]);
const inputMsg = ref<string>("");
const innerRef = ref<HTMLElement | null>(null);
const boxRef = ref<ScrollbarInstance | null>(null);

let isUserAtBottom = true;
const SCROLL_THRESHOLD = 100;

function handleEnter(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!props.canSend) {
      antMessage.warning({ content: "请等待消息响应完成", duration: 1 });
      return;
    }
    throttleSendMsg();
  }
}

function enableEnterSend() {
  if (msgInput.value && props.enterToSend) {
    msgInput.value.removeEventListener("keydown", handleEnter);
    msgInput.value.addEventListener("keydown", handleEnter);
  }
}

function disableEnterSend() {
  msgInput.value?.removeEventListener("keydown", handleEnter);
}

onUnmounted(disableEnterSend);

function handleScroll({ scrollTop }: { scrollTop: number }) {
  if (!boxRef.value || !innerRef.value) return;
  const wrapRef = boxRef.value.wrapRef;
  if (!wrapRef) return;

  const scrollHeight = innerRef.value.scrollHeight;
  const clientHeight = wrapRef.clientHeight;
  isUserAtBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
}

watch(
  () => innerRef.value?.clientHeight,
  () => {
    if (props.autoScroll && isUserAtBottom) scrollBottom();
  },
);

function scrollBottom() {
  nextTick(() => {
    if (boxRef.value && innerRef.value) {
      boxRef.value.setScrollTop(innerRef.value.scrollHeight);
      isUserAtBottom = true;
    }
  });
}

function smartScrollBottom() {
  if (props.autoScroll && isUserAtBottom) {
    nextTick(() => {
      boxRef.value?.setScrollTop(innerRef.value?.scrollHeight ?? 0);
    });
  }
}

const throttleSendMsg = throttle(sendMsg, 1000);

async function sendMsg() {
  if (!inputMsg.value.trim()) {
    antMessage.warning({ content: "请输入内容", duration: 1 });
    return;
  }

  const msg = inputMsg.value;
  inputMsg.value = "";
  await props.sendApi(msg);
  scrollBottom();
}

function cleanHistory() {
  emit("clean");
}

defineExpose({ scrollBottom, smartScrollBottom });
</script>

<style lang="scss" scoped>
.chat-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.message-area {
  flex: 1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);

  :deep(.el-scrollbar__wrap) {
    padding: 20px;
  }
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}

.message-enter-from,
.message-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.input-container {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 2px solid transparent;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &:focus-within {
    border-color: var(--mainColor);
    box-shadow: 0 4px 24px rgba(152, 16, 250, 0.15);
  }
}

.input-wrapper {
  padding: 16px 16px 8px;

  .message-input {
    width: 100%;
    min-height: 56px;
    max-height: 120px;
    border: none;
    outline: none;
    resize: none;
    font-size: 15px;
    line-height: 1.6;
    color: #1a1a1a;
    background: transparent;
    font-family: inherit;

    &::placeholder {
      color: #bbb;
    }

    // 覆盖 ant-design mentions 样式
    :deep(.ant-mentions) {
      border: none !important;
      box-shadow: none !important;

      &:hover,
      &:focus {
        border: none !important;
        box-shadow: none !important;
      }
    }
  }
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 12px;
}

.action-left {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #eee;
    color: #333;
  }

  &.danger:hover {
    background: #fff1f0;
    color: #ff4d4f;
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 14px;
  background: var(--mainGradient);
  color: #fff;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(152, 16, 250, 0.3);

  &:hover:not(.disabled) {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(152, 16, 250, 0.4);
  }

  &:active:not(.disabled) {
    transform: scale(0.95);
  }

  &.disabled {
    background: #e0e0e0;
    color: #999;
    cursor: not-allowed;
    box-shadow: none;
  }
}
</style>
