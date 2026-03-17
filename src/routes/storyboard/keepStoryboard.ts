import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { buildShotTimeline, parseEpisodeData } from "@/utils/outlineTimeline";

const router = express.Router();

function getPathname(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return new URL(url).pathname;
  }
  return url;
}

const resultSchema = z.object({
  videoPrompt: z.string(),
  prompt: z.string(),
  duration: z.string(),
  projectId: z.number(),
  filePath: z.string(),
  type: z.string(),
  name: z.string(),
  scriptId: z.number(),
  segmentId: z.number(),
  shotIndex: z.number(),
});

export default router.post(
  "/",
  validateFields({
    results: z.array(resultSchema),
  }),
  async (req, res) => {
    const { results } = req.body;
    const scriptId = results[0]?.scriptId;
    const script = await u.db("t_script").where({ id: scriptId }).first();
    const outline = script?.outlineId ? await u.db("t_outline").where({ id: script.outlineId }).first() : null;
    const episode = outline ? parseEpisodeData(outline.data, outline.episode || 1) : null;

    const grouped = new Map<number, typeof results>();
    results.forEach((item: typeof results[number]) => {
      const list = grouped.get(item.segmentId) || [];
      list.push(item);
      grouped.set(item.segmentId, list);
    });

    const rows = Array.from(grouped.entries()).flatMap(([segmentId, items]) => {
      const segment = episode?.segments.find((entry) => entry.segmentIndex === segmentId);
      const sorted = [...items].sort((left, right) => left.shotIndex - right.shotIndex);
      const timecodes = segment
        ? buildShotTimeline(
            segment,
            sorted.length,
            sorted.map((item) => Number(item.duration || 0)),
          )
        : [];

      return sorted.map((item, index) => {
        const timeline = timecodes[index];
        const remark = timeline
          ? JSON.stringify({
              ...timeline,
            })
          : null;
        return {
          ...item,
          duration: String(timeline?.durationSec ?? item.duration ?? ""),
          remark,
          filePath: getPathname(item.filePath),
        };
      });
    });

    await u.db("t_assets").insert(rows);
    res.status(200).send({ message: "靽????暹???" });
  },
);
