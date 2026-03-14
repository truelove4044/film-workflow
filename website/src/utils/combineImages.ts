export interface CombineGridOptions {
  images: (string | HTMLImageElement)[];
  columns?: number;
  rows?: number;
  placeholderColor?: string; // 可自定义占位图颜色
}

export default async function combineImagesToGrid(options: CombineGridOptions): Promise<string> {
  const { images, columns, rows, placeholderColor = "#eee" } = options;
  if (!images || images.length === 0) {
    throw new Error("图片数组不能为空");
  }

  const loadedImages = await Promise.all(images.map((img) => loadImageWithPlaceholder(img, placeholderColor)));

  const total = loadedImages.length;
  const col = columns || Math.ceil(Math.sqrt(total));
  const rw = rows || Math.ceil(total / col);

  const colWidths: number[] = Array(col).fill(0);
  const rowHeights: number[] = Array(rw).fill(0);

  loadedImages.forEach((img, idx) => {
    const c = idx % col;
    const r = Math.floor(idx / col);
    colWidths[c] = Math.max(colWidths[c], img.width);
    rowHeights[r] = Math.max(rowHeights[r], img.height);
  });

  const canvasWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const canvasHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法获取Canvas 2D上下文");
  }

  let x = 0,
    y = 0;
  for (let r = 0; r < rw; r++) {
    x = 0;
    for (let c = 0; c < col; c++) {
      const idx = r * col + c;
      if (idx >= loadedImages.length) {
        break;
      }
      ctx.drawImage(loadedImages[idx], x, y);
      x += colWidths[c];
    }
    y += rowHeights[r];
  }

  // 返回 base64 数据
  return canvas.toDataURL("image/png");
}

// 图片加载 + 占位处理
async function loadImageWithPlaceholder(src: string | HTMLImageElement, placeholderColor: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(src);
  } catch {
    // 加载失败时返回占位图片
    return createPlaceholderImage(100, 100, placeholderColor);
  }
}

// 原始图片加载
function loadImage(src: string | HTMLImageElement): Promise<HTMLImageElement> {
  if (typeof src !== "string") {
    if (src.complete) {
      return Promise.resolve(src);
    }
    return new Promise((resolve, reject) => {
      src.onload = () => resolve(src);
      src.onerror = reject;
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 生成占位图片
function createPlaceholderImage(width: number, height: number, color: string): HTMLImageElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(0, 0, width, height);
  ctx.fillStyle = "#888";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 36px Arial";
  ctx.fillText("?", width / 2, height / 2);

  const img = new window.Image();
  img.src = canvas.toDataURL("image/png");
  return img;
}
