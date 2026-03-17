import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {
  ensureOutlineScriptRow,
  normalizeEpisodeData,
  stringifyEpisodeData,
} from "@/utils/outlineTimeline";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    data: z.string(),
  }),
  async (req, res) => {
    const { projectId, data } = req.body;
    const maxIdResult: any = await u.db("t_outline").max("id as maxId").first();
    const newId = (maxIdResult?.maxId || 0) + 1;
    const episodeData = normalizeEpisodeData(JSON.parse(data), newId);

    await u.db("t_outline").insert({
      id: newId,
      episode: episodeData.episodeIndex,
      data: stringifyEpisodeData(episodeData),
      projectId,
    });

    await ensureOutlineScriptRow(projectId, newId, `第${episodeData.episodeIndex}集 ${episodeData.title}`.trim());

    res.status(200).send(success({ message: "?啣?憭抒熔??" }));
  },
);
