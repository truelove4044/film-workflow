import u from "@/utils";
import { parseEpisodeData } from "@/utils/outlineTimeline";

export default async function deleteOutline(id: number, projectId: number) {
  const targetOutlineData = await u.db("t_outline").where("id", id).select("data").first();
  if (!targetOutlineData) throw new Error("找不到大纲資料");

  const allOutlineDataList = await u.db("t_outline").where("projectId", projectId).andWhere("id", "!=", id).select("data", "episode");
  const allOutlineAssetNames = allOutlineDataList
    .flatMap((item) => {
      const data = parseEpisodeData(item?.data, item?.episode || 1);
      return [...data.characters, ...data.props, ...data.scenes].map((asset) => asset.name);
    })
    .filter(Boolean);

  const target = parseEpisodeData(targetOutlineData.data, 1);
  const targetNames = [...target.characters, ...target.props, ...target.scenes].map((item) => item.name);
  const diffAssetsNames = targetNames.filter((item) => !allOutlineAssetNames.includes(item));

  await u.db("t_outline").where("id", id).del();
  await u.db("t_script").where("outlineId", id).del();

  if (diffAssetsNames.length) {
    await u.db("t_assets").where("projectId", projectId).whereIn("name", diffAssetsNames).del();
  }
}
