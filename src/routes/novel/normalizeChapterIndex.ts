import u from "@/utils";

interface NovelRow {
  id: number;
  chapterIndex?: number | null;
}

function isValidChapterIndex(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// 修复同项目下重复/非法章节号，保证 chapterIndex 唯一且为正整数。
export default async function normalizeChapterIndex(projectId: number): Promise<boolean> {
  const rows = (await u
    .db("t_novel")
    .where("projectId", projectId)
    .select("id", "chapterIndex")
    .orderByRaw("CASE WHEN chapterIndex IS NULL OR chapterIndex <= 0 THEN 1 ELSE 0 END ASC")
    .orderBy("chapterIndex", "asc")
    .orderBy("id", "asc")) as NovelRow[];

  if (rows.length <= 1) return false;

  const validIndexes = rows
    .map((row) => Number(row.chapterIndex))
    .filter((index) => isValidChapterIndex(index));

  const usedIndexes = new Set<number>();
  let nextIndex = validIndexes.length > 0 ? Math.max(...validIndexes) + 1 : 1;
  const updates: Array<{ id: number; chapterIndex: number }> = [];

  for (const row of rows) {
    const currentIndex = Number(row.chapterIndex);

    if (isValidChapterIndex(currentIndex) && !usedIndexes.has(currentIndex)) {
      usedIndexes.add(currentIndex);
      continue;
    }

    while (usedIndexes.has(nextIndex)) {
      nextIndex += 1;
    }

    updates.push({ id: row.id, chapterIndex: nextIndex });
    usedIndexes.add(nextIndex);
    nextIndex += 1;
  }

  if (updates.length === 0) return false;

  await u.db.transaction(async (trx) => {
    for (const item of updates) {
      await trx("t_novel").where("id", item.id).update({ chapterIndex: item.chapterIndex });
    }
  });

  return true;
}

