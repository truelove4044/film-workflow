<template>
  <div v-loading="loading">
    <t-form ref="formRef" labelAlign="top" :data="formData" :rules="formRules" :colon="true" @submit="handleSubmit" @reset="handleReset">
      <t-form-item label="用户名" name="name">
        <t-input v-model="formData.name" placeholder="请输入用户名" clearable width="100%" />
      </t-form-item>
      <t-form-item label="密码" name="password">
        <t-input v-model="formData.password" type="password" placeholder="请输入密码" />
      </t-form-item>
      <t-form-item :status-icon="false">
        <t-space size="small">
          <t-button theme="primary" type="submit" :loading="loading">修改</t-button>
        </t-space>
      </t-form-item>
    </t-form>

    <t-divider />

    <div class="oauth-section">
      <t-alert
        theme="info"
        message="前置条件：需使用 file-based credential storage，或先确认主机 ~/.codex/auth.json 已存在；否则仅挂载 ~/.codex 不保证容器可读取到凭证。" />
      <t-space size="small" style="margin-top: 12px">
        <t-button theme="primary" :loading="oauthActionLoading" @click="startOauthFlow">一键登录并启动代理</t-button>
        <t-button theme="default" :loading="oauthStatusLoading" @click="fetchOauthStatus">刷新状态</t-button>
      </t-space>

      <div class="oauth-status">
        <t-tag :theme="getLoginTheme(oauthStatus.loginStatus)">登录状态：{{ getLoginLabel(oauthStatus.loginStatus) }}</t-tag>
        <t-tag :theme="getProxyTheme(oauthStatus.proxyStatus)">代理状态：{{ getProxyLabel(oauthStatus.proxyStatus) }}</t-tag>
      </div>

      <div class="oauth-info">当前消息：{{ oauthStatus.message || "无" }}</div>
      <div class="oauth-info">Proxy PID：{{ oauthStatus.pid ?? "无" }}</div>
      <div class="oauth-info">凭证路径：{{ oauthStatus.authPath || "未检测" }}（{{ oauthStatus.authFileReadable ? "可读" : "不可读" }}）</div>
      <div class="oauth-info">模型可用状态：{{ oauthStatus.proxyAvailable ? "可用" : "不可用" }}，可用模型数：{{ oauthStatus.modelCount }}</div>

      <t-textarea class="oauth-log" :value="oauthStatus.logs.join('\n')" readonly :autosize="{ minRows: 4, maxRows: 8 }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { FormInstanceFunctions, SubmitContext, FormRules } from "tdesign-vue-next";
import axios from "@/utils/axios";

interface UserForm {
  id: number | null;
  name: string;
  password: string;
}

type LoginStatus = "idle" | "running" | "awaiting_auth" | "success" | "failed";
type ProxyStatus = "stopped" | "starting" | "running" | "failed";

interface OauthRuntimeStatus {
  loginStatus: LoginStatus;
  proxyStatus: ProxyStatus;
  awaiting_auth: boolean;
  running: boolean;
  pid: number | null;
  message: string;
  logs: string[];
  lastUpdatedAt: number;
  authFileReadable: boolean;
  authPath: string;
  proxyAvailable: boolean;
  proxyHealthy: boolean;
  modelCount: number;
}

const formRef = ref<FormInstanceFunctions | null>(null);
const loading = ref(false);
const oauthActionLoading = ref(false);
const oauthStatusLoading = ref(false);
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);

const formData = ref<UserForm>({
  id: null,
  name: "",
  password: "",
});
const oauthStatus = ref<OauthRuntimeStatus>({
  loginStatus: "idle",
  proxyStatus: "stopped",
  awaiting_auth: false,
  running: false,
  pid: null,
  message: "",
  logs: [],
  lastUpdatedAt: 0,
  authFileReadable: false,
  authPath: "",
  proxyAvailable: false,
  proxyHealthy: false,
  modelCount: 0,
});

const formRules: FormRules<UserForm> = {
  name: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 2, max: 20, message: "用户名长度为 2-20 个字符", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, max: 20, message: "密码长度为 6-20 个字符", trigger: "blur" },
  ],
};

async function fetchUserInfo() {
  try {
    const res = await axios.get("/user/getUser");
    formData.value = {
      id: res.data.id ?? null,
      name: res.data.name ?? "",
      password: res.data.password ?? "",
    };
  } catch (error) {
    window.$message.error("获取用户信息失败");
  }
}

async function saveUserInfo() {
  loading.value = true;
  try {
    await axios.post("/user/saveUser", formData.value);
    window.$message.success("保存成功");
    await fetchUserInfo();
  } catch (error) {
    window.$message.error("保存失败");
  } finally {
    loading.value = false;
  }
}

function handleSubmit(context: SubmitContext) {
  if (context.validateResult === true) {
    saveUserInfo();
  }
}

function handleReset() {
  formRef.value?.reset();
}

function applyOauthStatus(data: Partial<OauthRuntimeStatus> | undefined) {
  if (!data) return;
  oauthStatus.value = {
    ...oauthStatus.value,
    ...data,
    logs: Array.isArray(data.logs) ? data.logs : oauthStatus.value.logs,
  };
}

function shouldContinuePolling(status: OauthRuntimeStatus) {
  if (status.running) return true;
  if (status.loginStatus === "awaiting_auth") return true;
  return status.proxyStatus === "starting";
}

function startPolling() {
  if (pollTimer.value) return;
  pollTimer.value = setInterval(() => {
    void fetchOauthStatus(false);
  }, 2500);
}

function stopPolling() {
  if (!pollTimer.value) return;
  clearInterval(pollTimer.value);
  pollTimer.value = null;
}

async function fetchOauthStatus(showLoading = true) {
  if (showLoading) oauthStatusLoading.value = true;
  try {
    const res = await axios.get("/other/chatgptOauth/status");
    applyOauthStatus(res.data as Partial<OauthRuntimeStatus>);
    if (shouldContinuePolling(oauthStatus.value)) {
      startPolling();
    } else {
      stopPolling();
    }
  } catch (error) {
    window.$message.error("获取 OAuth 状态失败");
    stopPolling();
  } finally {
    if (showLoading) oauthStatusLoading.value = false;
  }
}

async function startOauthFlow() {
  oauthActionLoading.value = true;
  try {
    const res = await axios.post("/other/chatgptOauth/start");
    const data = res.data as (Partial<OauthRuntimeStatus> & { accepted?: boolean; actionMessage?: string });
    applyOauthStatus(data);
    if (data.accepted === false) {
      window.$message.warning(data.actionMessage || "流程正在执行中");
    } else {
      window.$message.success(data.actionMessage || "已开始执行一键登录流程");
    }
    startPolling();
  } catch (error) {
    window.$message.error("一键登录启动失败");
  } finally {
    oauthActionLoading.value = false;
  }
}

function getLoginLabel(status: LoginStatus) {
  if (status === "idle") return "未执行";
  if (status === "running") return "执行中";
  if (status === "awaiting_auth") return "等待授权";
  if (status === "success") return "成功";
  return "失败";
}

function getLoginTheme(status: LoginStatus): "default" | "primary" | "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "awaiting_auth") return "warning";
  if (status === "running") return "primary";
  if (status === "failed") return "danger";
  return "default";
}

function getProxyLabel(status: ProxyStatus) {
  if (status === "stopped") return "已停止";
  if (status === "starting") return "启动中";
  if (status === "running") return "运行中";
  return "失败";
}

function getProxyTheme(status: ProxyStatus): "default" | "primary" | "success" | "warning" | "danger" {
  if (status === "running") return "success";
  if (status === "starting") return "primary";
  if (status === "failed") return "danger";
  return "default";
}

onMounted(() => {
  void fetchUserInfo();
  void fetchOauthStatus();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<style lang="scss" scoped>
.oauth-section {
  margin-top: 12px;
}

.oauth-status {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.oauth-info {
  margin-top: 8px;
  color: #444;
  font-size: 13px;
}

.oauth-log {
  margin-top: 12px;
}
</style>
