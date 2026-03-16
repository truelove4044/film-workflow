import u from "@/utils";
import axios from "axios";
import { v4 as uuid } from "uuid";

async function urlToBase64(imageUrl: string): Promise<string> {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const contentType = response.headers["content-type"] || "image/png";
  const base64 = Buffer.from(response.data, "binary").toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function getImageBase64ForId(imageId: string | number) {
  const numericId = Number(imageId);
  if (isNaN(numericId)) return "";

  const imageRow = await u
    .db("t_image")
    .select("filePath")
    .where({ id: numericId })
    .first();

  const assetsRow = !imageRow?.filePath
    ? await u
        .db("t_assets")
        .select("filePath")
        .where({ id: numericId })
        .first()
    : null;

  const resolvedPath = imageRow?.filePath || assetsRow?.filePath || "";
  if (!resolvedPath) return "";

  const url = /^https?:\/\//.test(resolvedPath) ? resolvedPath : await u.oss.getFileUrl(resolvedPath);
  return await urlToBase64(url);
}

async function convertDirectiveAndImages(images: Record<string, string | number>, directive: string) {
  const aliasList = Object.keys(images);
  const aliasRegex = /@[\u4e00-\u9fa5\w]+/g;
  const referencedAliases = directive.match(aliasRegex) || [];

  for (const alias of referencedAliases) {
    if (!(alias in images)) {
      throw new Error(`指令中引用了不存在的圖片別名：${alias}`);
    }
  }

  const aliasToIndex: Record<string, number> = {};
  aliasList.forEach((alias, i) => {
    aliasToIndex[alias] = i + 1;
  });

  let prompt = directive;
  for (const alias in aliasToIndex) {
    const idx = aliasToIndex[alias];
    const reg = new RegExp(alias.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1"), "g");
    prompt = prompt.replace(reg, `图片${idx}`);
  }

  const base64Images: string[] = [];
  for (const alias in images) {
    const imageVal = images[alias];
    const isBase64 = typeof imageVal === "string" && /^data:image\//.test(imageVal);
    if (isBase64) {
      base64Images.push(imageVal);
      continue;
    }

    if (typeof imageVal === "number" || (typeof imageVal === "string" && /^\d+$/.test(imageVal))) {
      const base64 = await getImageBase64ForId(imageVal);
      if (base64) base64Images.push(base64);
      continue;
    }

    if (typeof imageVal === "string" && imageVal.indexOf("http") >= 0) {
      const base64 = await urlToBase64(imageVal);
      base64Images.push(base64);
    }
  }

  return {
    prompt,
    images: base64Images,
  };
}

export default async (images: Record<string, string | number>, directive: string, projectId: number, aspectRatio: string | null) => {
  const { prompt, images: base64Images } = await convertDirectiveAndImages(images, directive);
  const apiConfig = await u.getPromptAi("editImage");

  const contentStr = await u.ai.image(
    {
      systemPrompt: "根据用户提供的具体修改指令，对上传的图片进行智能编辑。",
      prompt,
      imageBase64: base64Images,
      aspectRatio: aspectRatio ? aspectRatio : "16:9",
      size: "1K",
    },
    apiConfig,
  );

  const match = contentStr.match(/base64,([A-Za-z0-9+/=]+)/);
  const buffer = Buffer.from(match && match.length >= 1 ? match[1]! : contentStr, "base64");
  const filePath = `/${projectId}/storyboard/${uuid()}.jpg`;
  await u.oss.writeFile(filePath, buffer);
  return filePath;
};
