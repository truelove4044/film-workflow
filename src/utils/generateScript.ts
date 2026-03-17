import { EpisodeDataV2, compileScriptContent, normalizeEpisodeData } from "@/utils/outlineTimeline";

export async function generateScript(episode: EpisodeDataV2 | unknown): Promise<string> {
  const normalizedEpisode = normalizeEpisodeData(episode, 1);
  return compileScriptContent(normalizedEpisode);
}
