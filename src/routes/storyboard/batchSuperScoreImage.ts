import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import { v4 } from "uuid";
import axios from "axios";

const router = express.Router();

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

function isRejected<T>(result: PromiseSettledResult<T>): result is PromiseRejectedResult {
  return result.status === "rejected";
}

type CellInput = {
  id: string;
  prompt?: string;
  src: string;
};

type SegmentInput = {
  cells: CellInput[];
};

type AiConfig = {
  model?: string;
  apiKey?: string;
  manufacturer?: string;
};

async function urlToBase64(imageUrl: string): Promise<string> {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const contentType = response.headers["content-type"] || "image/png";
  const base64 = Buffer.from(response.data, "binary").toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function getUpscaleAiConfig() {
  const upscaleConfig = (await u.getPromptAi("storyboardUpscale")) as AiConfig;
  if (upscaleConfig?.model && upscaleConfig?.apiKey && upscaleConfig?.manufacturer) {
    return upscaleConfig;
  }
  return (await u.getPromptAi("storyboardImage")) as AiConfig;
}

async function superResolutionAndSave(src: string, projectId: number, videoRatio: string): Promise<{ ossPath: string; base64: string }> {
  const apiConfig = await getUpscaleAiConfig();
  const contentStr = await u.ai.image(
    {
      aspectRatio: videoRatio,
      size: "1K",
      resType: "b64",
      systemPrompt: "你的核心任务是将所给的图片超分到 1K，不改变图片内容，只提高分辨率。",
      prompt: "请将这张分镜图片超分到 1K，保持构图、人物、细节与文字内容不变。",
      imageBase64: [await urlToBase64(src)],
    },
    apiConfig,
  );

  const match = contentStr.match(/base64,([A-Za-z0-9+/=]+)/);
  const base64Str = match ? match[1] : contentStr;
  const buffer = Buffer.from(base64Str, "base64");
  const ossPath = `/${projectId}/chat/${v4()}.jpg`;
  await u.oss.writeFile(ossPath, buffer);
  return { ossPath, base64: `data:image/jpg;base64,${base64Str}` };
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().nullable().optional(),
    imageList: z.array(
      z.object({
        cells: z.array(
          z.object({
            id: z.string(),
            prompt: z.string().optional(),
            src: z.string(),
          }),
        ),
      }),
    ),
  }),
  async (req, res) => {
    const { projectId, scriptId, imageList } = req.body as {
      projectId: number;
      scriptId?: number | null;
      imageList: SegmentInput[];
    };

    const projectData = await u.db("t_project").where({ id: +projectId }).select("videoRatio").first();
    if (!projectData) return res.status(400).send(error("找不到專案設定"));

    const cells = imageList.reduce((list, segment) => list.concat(segment.cells), [] as CellInput[]);
    const results = await Promise.allSettled(
      cells.map(async (cell) => {
        const { ossPath } = await superResolutionAndSave(cell.src, projectId, projectData.videoRatio || "16:9");
        const assetsId = Number(cell.id);

        if (!isNaN(assetsId)) {
          await u.db("t_image").insert({
            assetsId,
            projectId,
            scriptId: scriptId ?? null,
            filePath: ossPath,
            type: "\u5206\u955c",
            state: "\u751f\u6210\u6210\u529f",
          });
        }

        return {
          id: cell.id,
          projectId,
          scriptId: scriptId ?? null,
          filePath: await u.oss.getFileUrl(ossPath),
          src: cell.src,
          type: "\u5206\u955c",
        };
      }),
    );

    const fulfilled = results.filter(isFulfilled).map((item) => item.value);
    const rejected = results.filter(isRejected);

    if (!fulfilled.length && rejected.length) {
      return res.status(500).send(error(u.error(rejected[0].reason).message));
    }

    if (rejected.length) {
      console.warn(`[storyboard/batchSuperScoreImage] ${rejected.length} cells failed during upscale`);
    }

    res.status(200).send(success(fulfilled));
  },
);
