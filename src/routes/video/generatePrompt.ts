import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

const modeSchema = z.enum(["startEnd", "multi", "single", "text"]);
const typeSchema = z.enum(["startEnd", "multi", "single", "text", ""]);

type GenerateMode = z.infer<typeof modeSchema>;

interface PromptImage {
  filePath: string;
  prompt: string;
}

interface StoryContextData {
  scriptContent: string;
  source: "videoConfig" | "script" | "draft";
}

const MODE_OUTPUT_CONTRACT: Record<GenerateMode, string> = {
  startEnd: "Return only Keyframes + Visual + Transition.",
  single: "Return only Keyframes + Visual + Transition.",
  multi: "Return only Keyframes + Visual.",
  text: "Return a compact Visual + Keyframes + Transition block.",
};

const MODE_DESCRIPTION: Record<GenerateMode, string> = {
  startEnd: "Start-End image bridge mode",
  multi: "Multi-image storyboard mode",
  single: "Single-image extrapolation mode",
  text: "Text-only motion prompt mode",
};

const getSystemPrompt = async (mode: GenerateMode) => {
  const promptsList = await u.db("t_prompts").where("code", "in", ["video-startEnd", "video-multi", "video-single", "video-main", "video-text"]);

  const fallbackPrompt = "Prompt config missing.";
  const getPromptValue = (code: string) => {
    const item = promptsList.find((p) => p.code === code);
    return item?.customValue ?? item?.defaultValue ?? fallbackPrompt;
  };

  return `${getPromptValue("video-main")}\n\n${getPromptValue(`video-${mode}`)}`;
};

function normalizeMode(mode?: string, type?: string): GenerateMode {
  const rawMode = (mode && mode.trim()) || (type && type.trim()) || "single";
  return modeSchema.safeParse(rawMode).success ? (rawMode as GenerateMode) : "single";
}

function sanitizeImages(images?: PromptImage[]): PromptImage[] {
  if (!Array.isArray(images)) {
    return [];
  }

  return images.filter((item) => item && typeof item.filePath === "string" && item.filePath.trim() !== "");
}

function normalizeModeInputs(mode: GenerateMode, images: PromptImage[]) {
  if (mode === "text") {
    return {
      mode,
      images: [] as PromptImage[],
      fallbackNote: "",
    };
  }

  if (mode === "single") {
    if (images.length !== 1) {
      throw new Error("single mode requires exactly 1 image");
    }
    return {
      mode,
      images,
      fallbackNote: "",
    };
  }

  if (mode === "multi") {
    if (images.length === 1) {
      return {
        mode: "single" as GenerateMode,
        images,
        fallbackNote: "Requested multi mode with 1 image, downgraded to single mode.",
      };
    }
    if (images.length < 2) {
      throw new Error("multi mode requires at least 2 images");
    }
    return {
      mode,
      images,
      fallbackNote: "",
    };
  }

  if (images.length === 0) {
    throw new Error("startEnd mode requires 1 or 2 images");
  }
  if (images.length > 2) {
    throw new Error("startEnd mode accepts at most 2 images");
  }

  return {
    mode,
    images,
    fallbackNote: images.length === 1 ? "Single start frame provided. Infer the target state from the same image." : "",
  };
}

async function getStoryContext(videoConfigId?: number, scriptId?: number, draftPrompt?: string): Promise<StoryContextData> {
  if (videoConfigId) {
    const row = await u
      .db("t_videoConfig")
      .leftJoin("t_script", "t_script.id", "t_videoConfig.scriptId")
      .where("t_videoConfig.id", videoConfigId)
      .select("t_script.content")
      .first();

    if (!row) {
      throw new Error("videoConfig not found");
    }

    if (row.content) {
      return {
        scriptContent: row.content,
        source: "videoConfig",
      };
    }
  }

  if (scriptId) {
    const row = await u.db("t_script").where("id", scriptId).select("content").first();
    if (row?.content) {
      return {
        scriptContent: row.content,
        source: "script",
      };
    }
  }

  return {
    scriptContent: (draftPrompt || "").trim(),
    source: "draft",
  };
}

function buildUserPrompt({
  originalMode,
  resolvedMode,
  images,
  duration,
  storyContext,
  draftPrompt,
  fallbackNote,
}: {
  originalMode: GenerateMode;
  resolvedMode: GenerateMode;
  images: PromptImage[];
  duration: number;
  storyContext: StoryContextData;
  draftPrompt: string;
  fallbackNote: string;
}) {
  const imagePrompts = images.length
    ? images.map((item, index) => `Image ${index + 1}: ${item.prompt || "(no image prompt provided)"}`).join("\n")
    : "None";

  const shotCount = images.length;
  const averageDuration = shotCount > 0 ? `${(duration / shotCount).toFixed(1)}s per shot` : "N/A";
  const additionalRequirements = storyContext.source === "draft" ? "" : draftPrompt.trim();

  return `Mode: ${MODE_DESCRIPTION[originalMode]}
Resolved Mode: ${MODE_DESCRIPTION[resolvedMode]}
${fallbackNote ? `Mode Fallback: ${fallbackNote}` : ""}

Output Contract:
${MODE_OUTPUT_CONTRACT[resolvedMode]}

Story Context Source:
${storyContext.source}

Story Context:
${storyContext.scriptContent || "No story context provided."}

Reference Images:
${imagePrompts}

${additionalRequirements ? `Additional Requirements / Existing Draft:\n${additionalRequirements}\n\n` : ""}Parameters:
- Total Duration: ${duration}s
- Shot Count: ${shotCount}
- Average Duration: ${averageDuration}

Generate the final video prompt now.`;
}

export default router.post(
  "/",
  validateFields({
    images: z
      .array(
        z.object({
          filePath: z.string(),
          prompt: z.string(),
        }),
      )
      .optional(),
    prompt: z.string(),
    duration: z.number(),
    mode: modeSchema.optional(),
    type: typeSchema.optional(),
    videoConfigId: z.number().optional(),
    scriptId: z.number().optional(),
  }),
  async (req, res) => {
    const { prompt, duration, videoConfigId, scriptId } = req.body;
    const requestedMode = normalizeMode(req.body.mode, req.body.type);
    const safeImages = sanitizeImages(req.body.images);

    let normalized;
    try {
      normalized = normalizeModeInputs(requestedMode, safeImages);
    } catch (e) {
      return res.status(400).send(error(u.error(e).message));
    }

    let storyContext: StoryContextData;
    try {
      storyContext = await getStoryContext(videoConfigId, scriptId, prompt);
    } catch (e) {
      return res.status(400).send(error(u.error(e).message));
    }

    const promptConfig = await getSystemPrompt(normalized.mode);
    const promptAiConfig = await u.getPromptAi("videoPrompt");
    const userPrompt = buildUserPrompt({
      originalMode: requestedMode,
      resolvedMode: normalized.mode,
      images: normalized.images,
      duration,
      storyContext,
      draftPrompt: prompt,
      fallbackNote: normalized.fallbackNote,
    });

    try {
      const result = await u.ai.text.invoke(
        {
          messages: [
            {
              role: "system",
              content: promptConfig,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        },
        promptAiConfig,
      );

      res.status(200).send(success(result.text));
    } catch (e) {
      return res.status(500).send(error(u.error(e).message));
    }
  },
);
