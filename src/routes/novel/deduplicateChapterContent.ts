import u from "@/utils";

interface NovelContentRow {
  id: number;
  chapterData?: string | null;
}

function normalizeChapterContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

// 清理同项目下重复内文，保留最早一条，删除后续重复项。
export default async function deduplicateChapterContent(projectId: number): Promise<number> {
  const rows = (await u
    .db("t_novel")
    .where("projectId", projectId)
    .select("id", "chapterData")
    .orderBy("id", "asc")) as NovelContentRow[];

  if (rows.length <= 1) return 0;

  const contentSet = new Set<string>();
  const duplicateIds: number[] = [];

  for (const row of rows) {
    const normalized = normalizeChapterContent(String(row.chapterData ?? ""));
    if (contentSet.has(normalized)) {
      duplicateIds.push(row.id);
      continue;
    }
    contentSet.add(normalized);
  }

  if (duplicateIds.length === 0) return 0;

  await u.db("t_novel").whereIn("id", duplicateIds).del();
  return duplicateIds.length;
}

