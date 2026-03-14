import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import normalizeChapterIndex from "./normalizeChapterIndex";
import deduplicateChapterContent from "./deduplicateChapterContent";
const router = express.Router();

// 更新原文数据
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    index: z.union([z.number(), z.string()]),
    reel: z.string(),
    chapter: z.string(),
    chapterData: z.string(),
  }),
  async (req, res) => {
    const { id, index, reel, chapter, chapterData } = req.body;

    const current = await u.db("t_novel").where("id", id).first("projectId");

    await u.db("t_novel").where("id", id).update({
      chapterIndex: index,
      reel,
      chapter,
      chapterData,
    });

    if (current?.projectId) {
      const projectId = Number(current.projectId);
      await deduplicateChapterContent(projectId);
      await normalizeChapterIndex(projectId);
    }

    res.status(200).send(success({ message: "更新原文成功" }));
  },
);
