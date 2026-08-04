async function loadDrawable(file) {
  if (window.createImageBitmap) {
    try {
      return { source: await createImageBitmap(file), cleanup: () => {} };
    } catch {
      // fall through to <img> fallback below
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = url;
  });
  return { source: img, cleanup: () => URL.revokeObjectURL(url) };
}

export async function resizeAndCompress(file, { maxEdge = 400, quality = 0.8 } = {}) {
  const { source, cleanup } = await loadDrawable(file);
  try {
    const width = source.width ?? source.naturalWidth;
    const height = source.height ?? source.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("画像の圧縮に失敗しました"))),
        "image/jpeg",
        quality
      );
    });
    return blob;
  } finally {
    if (source.close) source.close();
    cleanup();
  }
}

// Crops the (sx, sy, sw, sh) rect of the original image (in source pixel space)
// into a square outputSize×outputSize JPEG, for the tap-to-position photo picker.
export async function cropAndCompress(file, { sx, sy, sw, sh, outputSize = 400, quality = 0.8 }) {
  const { source, cleanup } = await loadDrawable(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("画像の圧縮に失敗しました"))),
        "image/jpeg",
        quality
      );
    });
    return blob;
  } finally {
    if (source.close) source.close();
    cleanup();
  }
}
