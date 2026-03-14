import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import normalizeChapterIndex from "./normalizeChapterIndex";
import deduplicateChapterContent from "./deduplicateChapterContent";
const router = express.Router();

function normalizeChapterContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

// 新增原文数据
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    data: z.array(
      z.object({
        index: z.number(),
        reel: z.string(),
        chapter: z.string(),
        chapterData: z.string(),
      })
    ),
  }),
  async (req, res) => {
    const { projectId, data } = req.body as {
      projectId: number;
      data: Array<{
        index: number;
        reel: string;
        chapter: string;
        chapterData: string;
      }>;
    };

    await deduplicateChapterContent(projectId);
    await normalizeChapterIndex(projectId);

    const existingRows = (await u.db("t_novel").where("projectId", projectId).select("chapterIndex", "chapterData")) as Array<{
      chapterIndex?: number | null;
      chapterData?: string | null;
    }>;

    const usedChapterIndexes = new Set<number>(
      existingRows
        .map((item) => Number(item.chapterIndex))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
    const existingChapterContents = new Set<string>(
      existingRows.map((item) => normalizeChapterContent(String(item.chapterData ?? ""))),
    );

    const incomingIndexes = data.map((item) => Number(item.index));
    const hasIncomingDuplicates = new Set(incomingIndexes).size !== incomingIndexes.length;
    const hasConflictWithExisting = incomingIndexes.some((index) => usedChapterIndexes.has(index));
    const shouldAutoReindex = hasIncomingDuplicates || hasConflictWithExisting;

    let nextChapterIndex =
      usedChapterIndexes.size > 0
        ? Math.max(...Array.from(usedChapterIndexes)) + 1
        : 1;
    let insertedCount = 0;
    let skippedDuplicateCount = 0;

    for (const item of data) {
      const normalizedContent = normalizeChapterContent(item.chapterData);
      if (existingChapterContents.has(normalizedContent)) {
        skippedDuplicateCount += 1;
        continue;
      }

      existingChapterContents.add(normalizedContent);

      let chapterIndex = Number(item.index);

      if (shouldAutoReindex || !Number.isFinite(chapterIndex) || chapterIndex <= 0) {
        while (usedChapterIndexes.has(nextChapterIndex)) {
          nextChapterIndex += 1;
        }
        chapterIndex = nextChapterIndex;
        nextChapterIndex += 1;
      }

      usedChapterIndexes.add(chapterIndex);

      await u.db("t_novel").insert({
        projectId,
        chapterIndex,
        reel: item.reel,
        chapter: item.chapter,
        chapterData: item.chapterData,
        createTime: Date.now(),
      });
      insertedCount += 1;
    }

    const message =
      skippedDuplicateCount > 0
        ? `新增 ${insertedCount} 章，跳过 ${skippedDuplicateCount} 章重复内文`
        : `新增原文成功，共新增 ${insertedCount} 章`;

    res.status(200).send(
      success({
        insertedCount,
        skippedDuplicateCount,
      }, message),
    );
  }
);
