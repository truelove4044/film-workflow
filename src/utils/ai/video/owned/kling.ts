import "../type";
import axios from "axios";
import jwt from "jsonwebtoken";
import { pollTask } from "@/utils/ai/utils";

const DEFAULT_KLING_VIDEO_ORIGIN = "https://api.klingai.com";

function generateJwtToken(ak: string, sk: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ak,
    exp: now + 1800,
    nbf: now - 5,
  };
  return jwt.sign(payload, sk, {
    algorithm: "HS256",
    header: { alg: "HS256", typ: "JWT" },
  });
}

function getApiToken(apiKey: string): string {
  const trimmedKey = apiKey.replace(/^Bearer\s+/i, "").trim();

  if (trimmedKey.includes("|")) {
    const parts = trimmedKey.split("|");
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      throw new Error("API Key格式错误，请使用 ak|sk 格式");
    }
    return generateJwtToken(parts[0].trim(), parts[1].trim());
  }

  return trimmedKey;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeVideoCreateUrl(rawUrl: string, type: "image2video" | "text2video"): string {
  if (!isHttpUrl(rawUrl)) {
    return `${DEFAULT_KLING_VIDEO_ORIGIN}/v1/videos/${type}`;
  }

  const parsedUrl = new URL(rawUrl);
  const path = parsedUrl.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/" || path === "/v1" || path === "/v1/videos") {
    parsedUrl.pathname = `/v1/videos/${type}`;
    return trimTrailingSlashes(parsedUrl.toString());
  }

  if (/\/(image2video|text2video)$/i.test(path)) {
    return trimTrailingSlashes(rawUrl).replace(/\/(image2video|text2video)$/i, `/${type}`);
  }

  return trimTrailingSlashes(parsedUrl.toString());
}

function resolveVideoEndpoints(baseURL?: string): {
  image2videoUrl: string;
  text2videoUrl: string;
  queryTemplate?: string;
} {
  const parts = (baseURL ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      image2videoUrl: `${DEFAULT_KLING_VIDEO_ORIGIN}/v1/videos/image2video`,
      text2videoUrl: `${DEFAULT_KLING_VIDEO_ORIGIN}/v1/videos/text2video`,
    };
  }

  if (parts.length === 1) {
    const singleUrl = parts[0]!;
    if (!isHttpUrl(singleUrl)) {
      return {
        image2videoUrl: `${DEFAULT_KLING_VIDEO_ORIGIN}/v1/videos/image2video`,
        text2videoUrl: `${DEFAULT_KLING_VIDEO_ORIGIN}/v1/videos/text2video`,
      };
    }
    return {
      image2videoUrl: normalizeVideoCreateUrl(singleUrl, "image2video"),
      text2videoUrl: normalizeVideoCreateUrl(singleUrl, "text2video"),
    };
  }

  const image2videoUrl = normalizeVideoCreateUrl(parts[0]!, "image2video");
  const text2videoUrl = normalizeVideoCreateUrl(parts[1]!, "text2video");
  const queryTemplate = parts[2] ? trimTrailingSlashes(parts[2]!) : undefined;
  return { image2videoUrl, text2videoUrl, queryTemplate };
}

function buildQueryUrl(taskId: string, createUrl: string, queryTemplate?: string): string {
  if (!queryTemplate) {
    return `${trimTrailingSlashes(createUrl)}/${taskId}`;
  }
  return queryTemplate.includes("{taskId}") ? queryTemplate.replace("{taskId}", taskId) : `${queryTemplate}/${taskId}`;
}

export default async (input: VideoConfig, config: AIConfig) => {
  if (!config.apiKey) throw new Error("缺少API Key");
  const { image2videoUrl, text2videoUrl, queryTemplate } = resolveVideoEndpoints(config.baseURL);

  const headers = {
    Authorization: `Bearer ${getApiToken(config.apiKey)}`,
    "Content-Type": "application/json",
  };

  // 解析模型名称和模式，例如 "kling-v2-6(PRO)" => modelName: "kling-v2-6", mode: "pro"
  const modelMatch = config.model!.match(/^(.+)\((STD|PRO)\)$/i);
  const modelName = modelMatch ? modelMatch[1] : config.model;
  const mode = modelMatch ? (modelMatch[2].toLowerCase() as "std" | "pro") : "std";

  // 判断是图生视频还是文生视频
  const hasImage = input.imageBase64 ? input.imageBase64.length > 0 : false;
  const createUrl = hasImage ? image2videoUrl : text2videoUrl;

  // 去除图片的内容类型前缀（kling要求纯base64）
  const stripDataUrl = (str: string) => str.replace(/^data:image\/[^;]+;base64,/, "");

  // 构建请求体
  const body: Record<string, unknown> = {
    model_name: modelName,
    mode,
    duration: String(input.duration),
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
  };

  if (hasImage) {
    // 图生视频：首帧和尾帧
    body.image = stripDataUrl(input.imageBase64![0]);
    if (input.imageBase64!.length > 1) {
      body.image_tail = stripDataUrl(input.imageBase64![1]);
    }
  }

  // 创建任务
  const createResponse = await axios.post(createUrl, body, { headers });
  const createData = createResponse.data;
  if (createData.code !== 0) {
    throw new Error(`创建任务失败: ${createData.message || "未知错误"}`);
  }

  const taskId = createData.data?.task_id;
  if (!taskId) {
    throw new Error("创建任务失败: 未返回任务ID");
  }

  // 轮询任务状态
  return await pollTask(async () => {
    const queryUrl = buildQueryUrl(taskId, createUrl, queryTemplate);
    const queryResponse = await axios.get(queryUrl, { headers });
    const queryData = queryResponse.data;
    if (queryData.code !== 0) {
      return { completed: false, error: `查询失败: ${queryData.message || "未知错误"}` };
    }

    const task = queryData.data;
    const taskStatus = task?.task_status;

    switch (taskStatus) {
      case "succeed": {
        const videoUrl = task?.task_result?.videos?.[0]?.url;
        if (!videoUrl) {
          return { completed: false, error: "任务成功但未返回视频URL" };
        }
        return { completed: true, url: videoUrl };
      }
      case "failed":
        return { completed: false, error: `任务失败: ${task?.task_status_msg || "未知原因"}` };
      case "submitted":
      case "processing":
        return { completed: false };
      default:
        return { completed: false, error: `未知状态: ${taskStatus}` };
    }
  });
};
