import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { buildClipPlanForScript } from "@/utils/outlineTimeline";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    scriptId: z.number(),
  }),
  async (req, res) => {
    const { scriptId } = req.body;
    const plan = await buildClipPlanForScript(scriptId);

    const clips = await Promise.all(
      plan.clips.map(async (clip) => ({
        ...clip,
        imageSource: clip.imageSource ? await u.oss.getFileUrl(clip.imageSource) : "",
      })),
    );

    res.status(200).send(success({ totalDurationSec: plan.totalDurationSec, clips, issues: plan.issues }));
  },
);
