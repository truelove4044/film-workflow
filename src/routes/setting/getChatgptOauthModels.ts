import express from "express";
import { z } from "zod";
import axios from "axios";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

interface OpenAIModelItem {
  id: string;
}

function mapProxyErrorMessage(message: string) {
  const msg = message.toLowerCase();
  if (msg.includes("econnrefused") || msg.includes("connect") || msg.includes("network")) {
    return "无法连接到本机 OAuth Proxy，请先启动 openai-oauth（127.0.0.1:10531）";
  }
  if (msg.includes("auth") || msg.includes("oauth") || msg.includes("token")) {
    return "登录凭证无效，请先重新执行 Codex 登录（npx @openai/codex login）";
  }
  return "无法连接 ChatGPT OAuth Proxy";
}

function normalizeBaseUrl(baseUrl?: string) {
  const raw = (baseUrl || "http://127.0.0.1:10531/v1").trim();
  const normalized = raw.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function getProxyRoot(baseUrl: string) {
  return baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;
}

export default router.post(
  "/",
  validateFields({
    baseUrl: z.string().optional(),
  }),
  async (req, res) => {
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const proxyRoot = getProxyRoot(baseUrl);

    try {
      const [healthRes, modelsRes] = await Promise.allSettled([
        axios.get(`${proxyRoot}/health`, { timeout: 5000 }),
        axios.get(`${baseUrl}/models`, { timeout: 5000 }),
      ]);

      if (modelsRes.status !== "fulfilled") {
        throw modelsRes.reason;
      }

      const modelData = Array.isArray(modelsRes.value.data?.data) ? (modelsRes.value.data.data as OpenAIModelItem[]) : [];
      const models = modelData
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => ({ label: id, value: id }));

      const healthy = healthRes.status === "fulfilled" && healthRes.value.data?.ok === true;

      return res.status(200).send(
        success({
          available: true,
          healthy,
          baseUrl,
          modelCount: models.length,
          models,
          message: healthy ? "连接正常" : "模型可用，但健康检查异常",
        }),
      );
    } catch (err: any) {
      const rawMessage = err?.response?.data?.error?.message || err?.message || "";
      return res.status(200).send(
        success({
          available: false,
          healthy: false,
          baseUrl,
          modelCount: 0,
          models: [],
          message: mapProxyErrorMessage(rawMessage),
        }),
      );
    }
  },
);
