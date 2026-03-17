import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import {
  buildScriptSegments,
  ensureOutlineScriptRow,
  parseEpisodeData,
} from "@/utils/outlineTimeline";

const router = express.Router();

interface Asset {
  id: number;
  type: string;
  name: string;
  filePath: string;
  intro?: string;
  prompt?: string;
}

interface ScriptRow {
  id?: number;
  name?: string;
  content?: string;
  outlineId: number;
  projectId: number;
  data: string;
  outlineEpisode: number;
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
  }),
  async (req, res) => {
    const { projectId } = req.body;
    const outlineRows = await u.db("t_outline").where("projectId", projectId).orderBy("episode", "asc").select("*");

    for (const outline of outlineRows) {
      const episode = parseEpisodeData(outline.data, outline.episode || 1);
      await ensureOutlineScriptRow(projectId, Number(outline.id), `第${episode.episodeIndex}集 ${episode.title}`.trim());
    }

    const rows: ScriptRow[] = await u
      .db("t_outline")
      .leftJoin("t_script", "t_outline.id", "t_script.outlineId")
      .where("t_outline.projectId", projectId)
      .orderBy("t_outline.episode", "asc")
      .select(
        "t_script.id",
        "t_script.name",
        "t_script.content",
        "t_script.outlineId",
        "t_script.projectId",
        "t_outline.data",
        "t_outline.episode as outlineEpisode",
      );

    const assets: Asset[] = await u
      .db("t_assets")
      .where("projectId", projectId)
      .andWhere("type", "<>", "??")
      .select("id", "type", "name", "filePath", "intro", "prompt");

    const data = await Promise.all(
      rows.map(async (item) => {
        const outlineMeta = parseEpisodeData(item.data, item.outlineEpisode || 1);
        const charData = outlineMeta.characters.map((asset) => asset.name);
        const propsData = outlineMeta.props.map((asset) => asset.name);
        const sceneData = outlineMeta.scenes.map((asset) => asset.name);

        const element = [
          ...assets.filter((asset) => asset.type === "?" && propsData.includes(asset.name)),
          ...assets.filter((asset) => asset.type === "閫" && charData.includes(asset.name)),
          ...assets.filter((asset) => asset.type === "?箸" && sceneData.includes(asset.name)),
        ];

        await Promise.all(
          element.map(async (asset) => {
            asset.filePath = asset.filePath ? await u.oss.getFileUrl(asset.filePath) : "";
          }),
        );

        return {
          ...item,
          outlineMeta,
          segments: buildScriptSegments(outlineMeta),
          element,
        };
      }),
    );

    res.status(200).send(success(data));
  },
);
