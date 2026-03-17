import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

function parseRemark(remark?: string | null) {
  if (!remark) return {};
  try {
    return JSON.parse(remark);
  } catch {
    return {};
  }
}

export default router.post(
  "/",
  validateFields({
    scriptId: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { scriptId } = req.body;

    const assets = await u
      .db("t_assets")
      .where("scriptId", scriptId)
      .where("type", "??")
      .select(
        "id",
        "name",
        "intro",
        "prompt",
        "filePath",
        "duration",
        "videoPrompt",
        "scriptId",
        "type",
        "segmentId",
        "shotIndex",
        "remark",
      )
      .orderBy("segmentId", "asc")
      .orderBy("shotIndex", "asc");

    const assetsIds = assets.map((item: any) => item.id);
    const generateImg = await u.db("t_image").whereIn("assetsId", assetsIds).where("type", "??").select("assetsId", "filePath");

    const data = await Promise.all(
      assets.map(async (item: any) => {
        const imgArr = await Promise.all(
          generateImg
            .filter((img: any) => Number(img.assetsId) === Number(item.id))
            .map(async (img: any) => ({
              ...img,
              filePath: await u.oss.getFileUrl(img.filePath ?? ""),
            })),
        );
        const timeline = parseRemark(item.remark);

        return {
          id: item.id,
          name: item.name,
          intro: item.intro,
          prompt: item.prompt,
          videoPrompt: item.videoPrompt,
          filePath: item.filePath ? await u.oss.getFileUrl(item.filePath) : "",
          type: item.type,
          scriptId: item.scriptId,
          duration: item.duration,
          durationSec: timeline.durationSec ?? Number(item.duration || 0),
          startSec: timeline.startSec ?? null,
          endSec: timeline.endSec ?? null,
          segmentTitle: timeline.segmentTitle ?? "",
          dialogueExcerpt: timeline.dialogueExcerpt ?? "",
          segmentId: item.segmentId ?? 1,
          shotIndex: item.shotIndex ?? 1,
          generateImg: imgArr,
        };
      }),
    );

    res.status(200).send(success(data));
  },
);
