import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { t_config } from "@/types/database";
import sharp from "sharp";
import modelList from "@/utils/ai/video/modelList";

const router = express.Router();

type RouteVideoMode = "startEnd" | "multi" | "single" | "text";
type ModelVideoType =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "multiImage"
  | "reference"
  | "text";

const TRUE_MULTI_MANUFACTURERS = new Set(["gemini", "vidu", "apimart"]);
const START_END_TYPES: ModelVideoType[] = [
  "startEndRequired",
  "endFrameOptional",
  "startFrameOptional",
];
const MULTI_TYPES: ModelVideoType[] = ["multiImage", "reference"];
const SINGLE_TYPES: ModelVideoType[] = ["singleImage"];
const TEXT_TYPES: ModelVideoType[] = ["text"];

interface ModeNormalizationResult {
  effectiveMode: RouteVideoMode;
  normalizedFilePath: string[];
  normalizationNote: string;
}

interface ProjectVideoContext {
  artStyle?: string | null;
  videoRatio?: string | null;
}

function includesType(source: Set<ModelVideoType>, target: ModelVideoType[]) {
  return target.some((item) => source.has(item));
}

function sameResolution(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function getCapabilityRows(manufacturer: string, model: string) {
  return modelList.filter(
    (item) => item.manufacturer === manufacturer && item.model === model,
  );
}

function getRowsByTypes(
  rows: ReturnType<typeof getCapabilityRows>,
  types: ModelVideoType[],
) {
  return rows.filter((row) =>
    row.type.some((item) => types.includes(item as ModelVideoType)),
  );
}

function validateDurationAndResolution(
  rows: ReturnType<typeof getCapabilityRows>,
  duration: number,
  resolution: string,
) {
  if (
    !rows.some((row) =>
      row.durationResolutionMap.some(
        (item) =>
          item.duration.includes(duration) &&
          (item.resolution.length === 0 ||
            item.resolution.some((supported) =>
              sameResolution(supported, resolution),
            )),
      ),
    )
  ) {
    throw new Error(
      `目前模型不支援 ${duration} 秒 / ${resolution} 的影片生成組合`,
    );
  }
}

function validateAspectRatio(
  rows: ReturnType<typeof getCapabilityRows>,
  aspectRatio: string,
) {
  const restrictedRows = rows.filter((row) => row.aspectRatio.length > 0);
  if (!restrictedRows.length) return;
  if (
    !restrictedRows.some((row) =>
      row.aspectRatio.includes(aspectRatio as `${number}:${number}`),
    )
  ) {
    throw new Error(`目前模型不支援 ${aspectRatio} 的影片比例`);
  }
}

function validateAudio(
  rows: ReturnType<typeof getCapabilityRows>,
  audioEnabled: boolean,
) {
  if (audioEnabled && !rows.some((row) => row.audio)) {
    throw new Error("目前模型不支援音訊輸出");
  }
}

function normalizeModeForModel(
  requestedMode: RouteVideoMode,
  inputFiles: string[],
  supportedTypes: Set<ModelVideoType>,
  manufacturer: string,
): ModeNormalizationResult {
  if (requestedMode === "text") {
    if (!includesType(supportedTypes, TEXT_TYPES)) {
      throw new Error("目前模型不支援 text 模式影片生成");
    }
    return {
      effectiveMode: "text",
      normalizedFilePath: [],
      normalizationNote: "",
    };
  }

  const safeFiles = inputFiles.filter((item) => item && item.trim() !== "");
  if (!safeFiles.length) {
    throw new Error("請提供至少一張參考圖片");
  }

  if (requestedMode === "single") {
    if (safeFiles.length !== 1) {
      throw new Error("single 模式必須提供且只能提供 1 張圖片");
    }
    if (!includesType(supportedTypes, SINGLE_TYPES)) {
      throw new Error("目前模型不支援 single 模式影片生成");
    }
    return {
      effectiveMode: "single",
      normalizedFilePath: safeFiles,
      normalizationNote: "",
    };
  }

  if (requestedMode === "startEnd") {
    if (safeFiles.length < 1 || safeFiles.length > 2) {
      throw new Error("startEnd 模式只能提供 1 到 2 張圖片");
    }
    if (supportedTypes.has("startEndRequired")) {
      if (safeFiles.length !== 2) {
        throw new Error("目前模型的 startEnd 模式必須提供首尾 2 張圖片");
      }
    } else if (!includesType(supportedTypes, START_END_TYPES)) {
      throw new Error("目前模型不支援 startEnd 模式影片生成");
    }

    return {
      effectiveMode: "startEnd",
      normalizedFilePath: safeFiles,
      normalizationNote: "",
    };
  }

  if (safeFiles.length < 2) {
    throw new Error("multi 模式至少需要 2 張圖片");
  }

  const supportsTrueMulti =
    includesType(supportedTypes, MULTI_TYPES) &&
    TRUE_MULTI_MANUFACTURERS.has(manufacturer);
  if (supportsTrueMulti) {
    return {
      effectiveMode: "multi",
      normalizedFilePath: safeFiles,
      normalizationNote: "",
    };
  }

  if (!includesType(supportedTypes, SINGLE_TYPES)) {
    throw new Error("目前模型不支援 multi 模式，也無法降級為 single 模式");
  }

  return {
    effectiveMode: "single",
    normalizedFilePath: safeFiles,
    normalizationNote:
      "multi mode normalized to single mode via collage fallback",
  };
}

function getValidationTypes(mode: RouteVideoMode): ModelVideoType[] {
  switch (mode) {
    case "text":
      return TEXT_TYPES;
    case "single":
      return SINGLE_TYPES;
    case "startEnd":
      return START_END_TYPES;
    case "multi":
      return MULTI_TYPES;
    default:
      return SINGLE_TYPES;
  }
}

function getPathname(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return new URL(url).pathname;
  }
  return url;
}

async function uploadInlineImages(fileUrl: string[], projectId: number) {
  const uploaded = await Promise.all(
    fileUrl.map(async (item) => {
      const match = item.match(/base64,([A-Za-z0-9+/=]+)/);
      const rawBase64 = !match && /^[A-Za-z0-9+/=]+$/.test(item) ? item : "";
      if ((!match || match.length < 2) && !rawBase64) {
        return item;
      }
      const imagePath = `/${projectId}/assets/${uuidv4()}.jpg`;
      const buffer = Buffer.from(rawBase64 || match![1], "base64");
      await u.oss.writeFile(imagePath, buffer);
      return await u.oss.getFileUrl(imagePath);
    }),
  );
  return uploaded;
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    configId: z.number(),
    type: z.string().optional(),
    resolution: z.string(),
    aiConfigId: z.number(),
    filePath: z.array(z.string()),
    duration: z.number(),
    prompt: z.string(),
    mode: z.enum(["startEnd", "multi", "single", "text"]),
    audioEnabled: z.boolean(),
  }),
  async (req, res) => {
    const {
      mode,
      scriptId,
      projectId,
      configId,
      aiConfigId,
      resolution,
      duration,
      prompt,
      audioEnabled,
    } = req.body;
    const requestedMode = mode as RouteVideoMode;
    const incomingFiles = Array.isArray(req.body.filePath)
      ? [...req.body.filePath]
      : [];

    const configData = await u
      .db("t_videoConfig")
      .where("id", configId)
      .first();
    if (!configData) {
      return res.status(400).send(error("找不到影片配置"));
    }

    let aiConfigData = null;
    if (configData.aiConfigId) {
      aiConfigData = await u
        .db("t_config")
        .where("id", configData.aiConfigId)
        .first();
    }
    if (!aiConfigData) {
      aiConfigData = await u.db("t_config").where("id", aiConfigId).first();
    }
    if (!aiConfigData) {
      return res.status(400).send(error("找不到影片模型設定"));
    }

    const projectData = (await u
      .db("t_project")
      .where("id", projectId)
      .select("artStyle", "videoRatio")
      .first()) as ProjectVideoContext | undefined;
    const aspectRatio = projectData?.videoRatio || "16:9";
    const capabilityRows = getCapabilityRows(
      aiConfigData.manufacturer!,
      aiConfigData.model!,
    );
    if (!capabilityRows.length) {
      return res
        .status(400)
        .send(
          error(
            `找不到模型能力定義：${aiConfigData.manufacturer}/${aiConfigData.model}`,
          ),
        );
    }

    let normalizedMode: ModeNormalizationResult;
    try {
      const supportedTypes = new Set<ModelVideoType>(
        capabilityRows.flatMap((row) => row.type as ModelVideoType[]),
      );
      normalizedMode = normalizeModeForModel(
        requestedMode,
        incomingFiles,
        supportedTypes,
        aiConfigData.manufacturer!,
      );

      const validationRows = getRowsByTypes(
        capabilityRows,
        getValidationTypes(normalizedMode.effectiveMode),
      );
      if (!validationRows.length) {
        throw new Error(
          `目前模型不支援 ${normalizedMode.effectiveMode} 模式影片生成`,
        );
      }

      validateDurationAndResolution(validationRows, duration, resolution);
      validateAspectRatio(validationRows, aspectRatio);
      validateAudio(validationRows, audioEnabled);
    } catch (e) {
      return res.status(400).send(error(u.error(e).message));
    }

    let fileUrl = [...normalizedMode.normalizedFilePath];
    if (
      requestedMode === "multi" &&
      normalizedMode.effectiveMode === "single" &&
      fileUrl.length > 1
    ) {
      const gridUrl = await sharpProcessingImage(fileUrl, projectId);
      fileUrl = [gridUrl];
    }

    try {
      fileUrl = await uploadInlineImages(fileUrl, projectId);
    } catch (e) {
      return res.status(400).send(error(u.error(e).message));
    }

    if (requestedMode !== "text" && !fileUrl.length) {
      return res.status(400).send(error("請提供可用的圖片參考"));
    }

    if (fileUrl.length) {
      const fileExistsResults = await Promise.all(
        fileUrl.map(async (url: string) => {
          const path = getPathname(url);
          return u.oss.fileExists(path);
        }),
      );

      if (!fileExistsResults.every(Boolean)) {
        return res.status(400).send(error("找不到可用的圖片檔案"));
      }
    }

    const firstFrame = fileUrl.length ? getPathname(fileUrl[0]!) : "";
    const storyboardImgs = fileUrl.map((item) => getPathname(item));
    const savePath = `/${projectId}/video/${uuidv4()}.mp4`;

    if (normalizedMode.normalizationNote) {
      console.info(
        `[video/generateVideo] mode normalized: request=${requestedMode}, effective=${normalizedMode.effectiveMode}, configId=${configId}`,
      );
    }

    const [videoId] = await u.db("t_video").insert({
      scriptId,
      configId,
      time: duration,
      resolution,
      prompt,
      firstFrame,
      storyboardImgs: JSON.stringify(storyboardImgs),
      filePath: savePath,
      state: 0,
    });

    res.status(200).send(
      success({
        id: videoId,
        configId,
        requestedMode,
        effectiveMode: normalizedMode.effectiveMode,
        normalization: normalizedMode.normalizationNote || null,
      }),
    );

    generateVideoAsync(
      videoId,
      projectId,
      fileUrl,
      savePath,
      prompt,
      duration,
      resolution,
      audioEnabled,
      aiConfigData,
      normalizedMode.effectiveMode,
      projectData,
    );
  },
);

async function generateVideoAsync(
  videoId: number,
  projectId: number,
  fileUrl: string[],
  savePath: string,
  prompt: string,
  duration: number,
  resolution: string,
  audioEnabled: boolean,
  aiConfigData: t_config,
  mode: RouteVideoMode,
  projectData?: ProjectVideoContext,
) {
  try {
    const runtimeProjectData =
      projectData ??
      ((await u
        .db("t_project")
        .where("id", projectId)
        .select("artStyle", "videoRatio")
        .first()) as ProjectVideoContext | undefined);

    const imageBase64 = await Promise.all(
      fileUrl.map((item) => {
        if (item.startsWith("http://") || item.startsWith("https://")) {
          return u.oss.getImageBase64(getPathname(item));
        }
        return u.oss.getImageBase64(item);
      }),
    );

    const inputPrompt = `
请完全参照以下内容生成视频：
${prompt}
重要强调：
风格高度保持${runtimeProjectData?.artStyle || "CG"}风格，保证人物一致性
1. 视频整体风格、色调、光影、人脸五官与参考图片保持高度一致
2. 保证视频连贯性、前后无矛盾
3. 关键人物在画面中全部清晰显示，不得被遮挡、缺失或省略
4. 画面真实、细致，无畸形、无模糊、无杂物、无多余人物、无文字、水印、logo
`;

    const videoPath = await u.ai.video(
      {
        imageBase64,
        savePath,
        prompt: inputPrompt,
        duration: duration as any,
        aspectRatio: runtimeProjectData?.videoRatio as any,
        resolution: resolution as any,
        audio: audioEnabled,
        mode: mode as any,
      },
      {
        baseURL: aiConfigData?.baseUrl!,
        model: aiConfigData?.model!,
        apiKey: aiConfigData?.apiKey!,
        manufacturer: aiConfigData?.manufacturer!,
      },
    );

    if (videoPath) {
      await u.db("t_video").where("id", videoId).update({
        filePath: videoPath,
        state: 1,
      });
    } else {
      await u.db("t_video").where("id", videoId).update({ state: -1 });
    }
  } catch (err) {
    console.error(`视频生成失败 videoId=${videoId}:`, err);
    await u
      .db("t_video")
      .where("id", videoId)
      .update({ state: -1, errorReason: u.error(err).message });
  }
}

async function sharpProcessingImage(
  imageList: string[],
  projectId: number,
): Promise<string> {
  if (!imageList || imageList.length === 0) {
    throw new Error("圖片列表不可為空");
  }

  if (imageList.length > 9) {
    throw new Error("圖片數量不可超過 9 張");
  }

  const count = imageList.length;
  let cols: number;
  let rows: number;

  if (count === 1) {
    cols = 1;
    rows = 1;
  } else if (count === 2) {
    cols = 2;
    rows = 1;
  } else if (count <= 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = 3;
    rows = 3;
  }

  const loadedImages = await Promise.all(
    imageList.map(async (imagePath) => {
      let imageBuffer: Buffer;

      if (
        imagePath.startsWith("data:image") ||
        imagePath.match(/^[A-Za-z0-9+/=]+$/)
      ) {
        const base64Data = imagePath.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");
      } else if (
        imagePath.startsWith("http://") ||
        imagePath.startsWith("https://")
      ) {
        imageBuffer = await u.oss.getFile(new URL(imagePath).pathname);
      } else {
        imageBuffer = await u.oss.getFile(imagePath);
      }

      const metadata = await sharp(imageBuffer).metadata();
      return {
        buffer: imageBuffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    }),
  );

  const maxWidth = Math.max(...loadedImages.map((img) => img.width));
  const maxHeight = Math.max(...loadedImages.map((img) => img.height));

  const imageData = await Promise.all(
    loadedImages.map(async (img) => {
      const resizedBuffer = await sharp(img.buffer)
        .resize(maxWidth, maxHeight, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .png()
        .toBuffer();

      return {
        buffer: resizedBuffer,
        width: maxWidth,
        height: maxHeight,
      };
    }),
  );

  const cellWidth = maxWidth;
  const cellHeight = maxHeight;
  const canvasWidth = cols * cellWidth;
  const canvasHeight = rows * cellHeight;

  const canvas = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const compositeOperations = imageData.map((data, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      input: data.buffer,
      top: row * cellHeight,
      left: col * cellWidth,
    };
  });

  const result = await canvas.composite(compositeOperations).png().toBuffer();
  const imagePath = `/${projectId}/assets/${uuidv4()}.jpg`;
  await u.oss.writeFile(imagePath, result);

  return await u.oss.getFileUrl(imagePath);
}
