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
    id: z.number(),
    data: z.string(),
  }),
  async (req, res) => {
    const { id, data } = req.body;
    const existing = await u.db("t_outline").where("id", id).first();
    const episodeData = normalizeEpisodeData(JSON.parse(data), existing?.episode || id);

    await u.db("t_outline").where("id", id).update({
      episode: episodeData.episodeIndex,
      data: stringifyEpisodeData(episodeData),
    });

    if (existing?.projectId) {
      await ensureOutlineScriptRow(existing.projectId, id, `第${episodeData.episodeIndex}集 ${episodeData.title}`.trim());
      await u
        .db("t_script")
        .where({ projectId: existing.projectId, outlineId: id })
        .update({ name: `第${episodeData.episodeIndex}集 ${episodeData.title}`.trim() });
    }

    res.status(200).send(success({ message: "?湔憭抒熔??" }));
  },
);
