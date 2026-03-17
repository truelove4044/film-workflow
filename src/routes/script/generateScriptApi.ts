import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {
  buildScriptSegments,
  parseEpisodeData,
  stringifyEpisodeData,
} from "@/utils/outlineTimeline";
import { generateScript } from "@/utils/generateScript";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    outlineId: z.number(),
    scriptId: z.number(),
  }),
  async (req, res) => {
    const { outlineId, scriptId } = req.body;
    const outlineData = await u.db("t_outline").where("id", outlineId).select("*").first();
    if (!outlineData) return res.status(500).send(success({ message: "憭抒熔銝箇征" }));

    const episode = parseEpisodeData(outlineData.data, outlineData.episode || 1);

    try {
      const content = await generateScript(episode);
      await u.db("t_outline").where("id", outlineId).update({
        episode: episode.episodeIndex,
        data: stringifyEpisodeData(episode),
      });
      await u.db("t_script").where("id", scriptId).update({
        content,
        name: `第${episode.episodeIndex}集 ${episode.title}`.trim(),
      });

      res.status(200).send(
        success({
          message: "???扳??",
          data: {
            content,
            scriptSegments: buildScriptSegments(episode),
            totalDurationSec: episode.totalDurationSec,
          },
        }),
      );
    } catch (e) {
      const errMsg = u.error(e).message || "???扳憭梯揖";
      res.status(500).send(error(errMsg));
    }
  },
);
