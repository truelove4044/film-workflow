import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {
  ensureOutlineScriptRow,
  parseEpisodeData,
  stringifyEpisodeData,
} from "@/utils/outlineTimeline";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
  }),
  async (req, res) => {
    const { projectId } = req.body;
    const rows = await u.db("t_outline").where("projectId", projectId).orderBy("episode", "asc").select("*");

    const normalizedRows = await Promise.all(
      rows.map(async (row: any) => {
        const episode = parseEpisodeData(row.data, row.episode || 1);
        const normalizedData = stringifyEpisodeData(episode);
        if (normalizedData !== row.data || row.episode !== episode.episodeIndex) {
          await u.db("t_outline").where("id", row.id).update({
            episode: episode.episodeIndex,
            data: normalizedData,
          });
        }
        await ensureOutlineScriptRow(projectId, row.id, `第${episode.episodeIndex}集 ${episode.title}`.trim());
        return {
          ...row,
          episode: episode.episodeIndex,
          data: normalizedData,
        };
      }),
    );

    res.status(200).send(success(normalizedRows));
  },
);
