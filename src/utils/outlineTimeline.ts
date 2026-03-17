import u from "@/utils";

export interface OutlineAssetRefMap {
  characters: string[];
  props: string[];
  scenes: string[];
}

export interface OutlineSegment {
  segmentIndex: number;
  title: string;
  summary: string;
  dialogue: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  visualFocus: string;
  keyBeat: string;
  assetRefs: OutlineAssetRefMap;
}

export interface OutlineAssetItem {
  name: string;
  description: string;
}

export interface EpisodeDataV2 {
  version: 2;
  episodeIndex: number;
  title: string;
  chapterRange: number[];
  scenes: OutlineAssetItem[];
  characters: OutlineAssetItem[];
  props: OutlineAssetItem[];
  coreConflict: string;
  outline: string;
  openingHook: string;
  keyEvents: string[];
  emotionalCurve: string;
  visualHighlights: string[];
  endingHook: string;
  classicQuotes: string[];
  totalDurationSec: number;
  segments: OutlineSegment[];
}

export interface ScriptSegmentView extends OutlineSegment {
  scriptText: string;
}

export interface StoryboardTimeRange {
  segmentId: number;
  shotIndex: number;
  durationSec: number;
  startSec: number;
  endSec: number;
  segmentTitle: string;
  dialogueExcerpt: string;
}

const MIN_SEGMENT_DURATION = 1;
const DEFAULT_SEGMENT_DURATION = 4;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function normalizeAssetRefs(value: unknown): OutlineAssetRefMap {
  const raw = value && typeof value === "object" ? (value as Partial<OutlineAssetRefMap>) : {};
  return {
    characters: asStringArray(raw.characters),
    props: asStringArray(raw.props),
    scenes: asStringArray(raw.scenes),
  };
}

function normalizeAssetItems(value: unknown): OutlineAssetItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: asString((item as OutlineAssetItem)?.name),
      description: asString((item as OutlineAssetItem)?.description),
    }))
    .filter((item) => item.name);
}

function defaultAssetRefsFromEpisode(episode: Partial<EpisodeDataV2>): OutlineAssetRefMap {
  return {
    characters: normalizeAssetItems(episode.characters).map((item) => item.name),
    props: normalizeAssetItems(episode.props).map((item) => item.name),
    scenes: normalizeAssetItems(episode.scenes).map((item) => item.name),
  };
}

function buildFallbackSegments(episode: Partial<EpisodeDataV2>): OutlineSegment[] {
  const summary = asString(episode.outline);
  const dialogueSource = asStringArray(episode.classicQuotes).join("\n");
  const fallbackDialogue = dialogueSource || summary || asString(episode.openingHook);

  return [
    {
      segmentIndex: 1,
      title: asString(episode.title) || "段落 1",
      summary,
      dialogue: fallbackDialogue,
      durationSec: Math.max(DEFAULT_SEGMENT_DURATION, Math.min(12, Math.ceil(fallbackDialogue.length / 20) || DEFAULT_SEGMENT_DURATION)),
      startSec: 0,
      endSec: 0,
      visualFocus: asStringArray(episode.visualHighlights).join(" / "),
      keyBeat: asStringArray(episode.keyEvents)[0] || asString(episode.coreConflict),
      assetRefs: defaultAssetRefsFromEpisode(episode),
    },
  ];
}

export function recalculateSegments(segments: OutlineSegment[]): OutlineSegment[] {
  let cursor = 0;
  return segments.map((segment, index) => {
    const durationSec = Math.max(MIN_SEGMENT_DURATION, Math.round(asNumber(segment.durationSec, DEFAULT_SEGMENT_DURATION)));
    const startSec = cursor;
    const endSec = startSec + durationSec;
    cursor = endSec;
    return {
      segmentIndex: index + 1,
      title: asString(segment.title) || `段落 ${index + 1}`,
      summary: asString(segment.summary),
      dialogue: asString(segment.dialogue),
      durationSec,
      startSec,
      endSec,
      visualFocus: asString(segment.visualFocus),
      keyBeat: asString(segment.keyBeat),
      assetRefs: normalizeAssetRefs(segment.assetRefs),
    };
  });
}

function normalizeSegments(rawSegments: unknown, episode: Partial<EpisodeDataV2>): OutlineSegment[] {
  const segments = Array.isArray(rawSegments) ? rawSegments : [];
  const baseSegments = segments.length ? segments : buildFallbackSegments(episode);

  return recalculateSegments(
    baseSegments.map((segment, index) => ({
      segmentIndex: asNumber((segment as OutlineSegment)?.segmentIndex, index + 1),
      title: asString((segment as OutlineSegment)?.title),
      summary: asString((segment as OutlineSegment)?.summary),
      dialogue: asString((segment as OutlineSegment)?.dialogue),
      durationSec: asNumber((segment as OutlineSegment)?.durationSec, DEFAULT_SEGMENT_DURATION),
      startSec: asNumber((segment as OutlineSegment)?.startSec, 0),
      endSec: asNumber((segment as OutlineSegment)?.endSec, 0),
      visualFocus: asString((segment as OutlineSegment)?.visualFocus),
      keyBeat: asString((segment as OutlineSegment)?.keyBeat),
      assetRefs: normalizeAssetRefs((segment as OutlineSegment)?.assetRefs),
    })),
  );
}

export function normalizeEpisodeData(input: unknown, fallbackEpisodeIndex = 1): EpisodeDataV2 {
  const raw = input && typeof input === "object" ? (input as Partial<EpisodeDataV2>) : {};
  const normalized: EpisodeDataV2 = {
    version: 2,
    episodeIndex: asNumber(raw.episodeIndex, fallbackEpisodeIndex),
    title: asString(raw.title),
    chapterRange: Array.isArray(raw.chapterRange)
      ? raw.chapterRange.map((item) => asNumber(item)).filter((item) => Number.isFinite(item))
      : [],
    scenes: normalizeAssetItems(raw.scenes),
    characters: normalizeAssetItems(raw.characters),
    props: normalizeAssetItems(raw.props),
    coreConflict: asString(raw.coreConflict),
    outline: asString(raw.outline),
    openingHook: asString(raw.openingHook),
    keyEvents: asStringArray(raw.keyEvents),
    emotionalCurve: asString(raw.emotionalCurve),
    visualHighlights: asStringArray(raw.visualHighlights),
    endingHook: asString(raw.endingHook),
    classicQuotes: asStringArray(raw.classicQuotes),
    totalDurationSec: 0,
    segments: [],
  };

  normalized.segments = normalizeSegments(raw.segments, normalized);
  normalized.totalDurationSec = normalized.segments.at(-1)?.endSec ?? 0;

  return normalized;
}

export function parseEpisodeData(rawData: string | null | undefined, fallbackEpisodeIndex = 1): EpisodeDataV2 {
  try {
    return normalizeEpisodeData(rawData ? JSON.parse(rawData) : {}, fallbackEpisodeIndex);
  } catch {
    return normalizeEpisodeData({}, fallbackEpisodeIndex);
  }
}

export function stringifyEpisodeData(data: EpisodeDataV2): string {
  return JSON.stringify(normalizeEpisodeData(data, data.episodeIndex));
}

export function buildScriptSegments(episode: EpisodeDataV2): ScriptSegmentView[] {
  return episode.segments.map((segment) => ({
    ...segment,
    scriptText: [
      `[${String(segment.startSec).padStart(2, "0")}s-${String(segment.endSec).padStart(2, "0")}s] ${segment.title}`,
      segment.summary ? `摘要：${segment.summary}` : "",
      segment.dialogue ? `台詞：\n${segment.dialogue}` : "",
      segment.visualFocus ? `畫面重點：${segment.visualFocus}` : "",
      segment.keyBeat ? `節拍：${segment.keyBeat}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    }));
}

export function compileScriptContent(episode: EpisodeDataV2): string {
  return [
    `第${episode.episodeIndex}集 ${episode.title}`.trim(),
    `總時長：${episode.totalDurationSec} 秒`,
    "",
    ...buildScriptSegments(episode).map((segment) => segment.scriptText),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildShotTimeline(segment: OutlineSegment, shotCount: number, requestedDurations: number[] = []): StoryboardTimeRange[] {
  const safeShotCount = Math.max(shotCount, 1);
  const requestedTotal = requestedDurations.reduce((sum, value) => sum + Math.max(0, Math.round(value)), 0);
  let durations: number[];

  if (requestedTotal > 0 && requestedDurations.length === safeShotCount) {
    durations = requestedDurations.map((value) => Math.max(0, Math.round((value / requestedTotal) * segment.durationSec)));
  } else {
    const base = Math.floor(segment.durationSec / safeShotCount);
    const remainder = segment.durationSec % safeShotCount;
    durations = Array.from({ length: safeShotCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  const diff = segment.durationSec - durations.reduce((sum, value) => sum + value, 0);
  if (durations.length) {
    durations[durations.length - 1] += diff;
  }

  let cursor = segment.startSec;
  return durations.map((durationSec, index) => {
    const safeDuration = Math.max(MIN_SEGMENT_DURATION, durationSec || 0);
    const startSec = cursor;
    const endSec = index === durations.length - 1 ? segment.endSec : Math.min(segment.endSec, startSec + safeDuration);
    cursor = endSec;
    return {
      segmentId: segment.segmentIndex,
      shotIndex: index + 1,
      durationSec: endSec - startSec,
      startSec,
      endSec,
      segmentTitle: segment.title,
      dialogueExcerpt: segment.dialogue.slice(0, 120),
    };
  });
}

export interface ClipPlanItem extends StoryboardTimeRange {
  imageSource: string;
  videoPrompt: string;
  storyboardAssetId: number;
}

export interface ClipPlanResult {
  totalDurationSec: number;
  clips: ClipPlanItem[];
  issues: string[];
}

function parseRemarkTimeline(remark: string | null | undefined): Partial<StoryboardTimeRange> {
  if (!remark) return {};
  try {
    const parsed = JSON.parse(remark);
    if (parsed && typeof parsed === "object") {
      return {
        segmentId: asNumber((parsed as StoryboardTimeRange).segmentId, 0),
        shotIndex: asNumber((parsed as StoryboardTimeRange).shotIndex, 0),
        durationSec: asNumber((parsed as StoryboardTimeRange).durationSec, 0),
        startSec: asNumber((parsed as StoryboardTimeRange).startSec, 0),
        endSec: asNumber((parsed as StoryboardTimeRange).endSec, 0),
      };
    }
  } catch {
    return {};
  }
  return {};
}

export async function ensureOutlineScriptRow(projectId: number, outlineId: number, episodeName: string) {
  const existing = await u.db("t_script").where({ projectId, outlineId }).first();
  if (existing) return existing;

  const maxIdResult: any = await u.db("t_script").max("id as maxId").first();
  const newId = (maxIdResult?.maxId || 0) + 1;
  await u.db("t_script").insert({
    id: newId,
    name: episodeName,
    content: "",
    projectId,
    outlineId,
  });
  return u.db("t_script").where({ id: newId }).first();
}

export async function buildClipPlanForScript(scriptId: number): Promise<ClipPlanResult> {
  const script = await u.db("t_script").where({ id: scriptId }).first();
  if (!script?.outlineId) {
    return { totalDurationSec: 0, clips: [], issues: ["缺少對應大綱"] };
  }

  const outlineRow = await u.db("t_outline").where({ id: script.outlineId }).first();
  if (!outlineRow) {
    return { totalDurationSec: 0, clips: [], issues: ["找不到大綱資料"] };
  }

  const episode = parseEpisodeData(outlineRow.data, outlineRow.episode || 1);
  const storyboardAssets = await u
    .db("t_assets")
    .where({ scriptId, type: "??" })
    .orderBy("segmentId", "asc")
    .orderBy("shotIndex", "asc");

  const issues: string[] = [];
  const clips: ClipPlanItem[] = [];

  for (const segment of episode.segments) {
    const shots = storyboardAssets.filter((item: any) => Number(item.segmentId) === segment.segmentIndex);
    if (!shots.length) {
      issues.push(`片段 ${segment.segmentIndex} 缺少分鏡`);
      continue;
    }

    const timelines = buildShotTimeline(
      segment,
      shots.length,
      shots.map((item: any) => asNumber(item.duration, 0)),
    );

    shots.forEach((shot: any, index: number) => {
      const remarkTimeline = parseRemarkTimeline(shot.remark);
      const timeline = timelines[index];
      const startSec = remarkTimeline.startSec ?? timeline.startSec;
      const endSec = remarkTimeline.endSec ?? timeline.endSec;
      const durationSec = remarkTimeline.durationSec ?? timeline.durationSec;

      clips.push({
        ...timeline,
        startSec,
        endSec,
        durationSec,
        imageSource: shot.filePath || "",
        videoPrompt: shot.videoPrompt || "",
        storyboardAssetId: shot.id,
      });
    });

    const segmentDuration = clips
      .filter((clip) => clip.segmentId === segment.segmentIndex)
      .reduce((sum, clip) => sum + clip.durationSec, 0);
    if (segmentDuration !== segment.durationSec) {
      issues.push(`片段 ${segment.segmentIndex} 的鏡頭秒數總和 ${segmentDuration} 與段落秒數 ${segment.durationSec} 不一致`);
    }
  }

  clips.sort((left, right) => left.startSec - right.startSec || left.segmentId - right.segmentId || left.shotIndex - right.shotIndex);

  const lastEnd = clips.at(-1)?.endSec ?? 0;
  if (lastEnd !== episode.totalDurationSec) {
    issues.push(`Clip plan 總長 ${lastEnd} 與大綱總長 ${episode.totalDurationSec} 不一致`);
  }

  return {
    totalDurationSec: episode.totalDurationSec,
    clips,
    issues,
  };
}
