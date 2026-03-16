import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    filePath: z.record(z.string(), z.union([z.string(), z.number()])),
    prompt: z.string(),
    projectId: z.number(),
    assetsId: z.number().nullable().optional(),
  }),
  async (req, res) => {
    const { filePath, prompt, projectId, assetsId } = req.body;
    const projectInfo = await u.db("t_project").where({ id: projectId }).select("videoRatio").first();
    if (!projectInfo) {
      return res.status(400).send(error("找不到專案設定"));
    }

    const data = await u.editImage(filePath, prompt, projectId, projectInfo.videoRatio || "16:9");
    const returnData: {
      id: number | null;
      url: string | null;
    } = {
      id: null,
      url: null,
    };

    if (assetsId) {
      const assetInfo = await u.db("t_assets").where({ id: assetsId }).select("projectId", "scriptId").first();
      const [id] = await u.db("t_image").insert({
        filePath: data,
        assetsId,
        projectId: assetInfo?.projectId ?? projectId,
        scriptId: assetInfo?.scriptId ?? null,
        type: "\u5206\u955c",
        state: "\u751f\u6210\u6210\u529f",
      });
      returnData.id = id ?? null;
    }

    returnData.url = await u.oss.getFileUrl(data);
    res.status(200).send(success(returnData));
  },
);
