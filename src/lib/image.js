// 画像ファイルを縮小＆JPEG圧縮して dataURL を返す。
// Firestore の1ドキュメント上限(約1MB)に収まるよう、必要なら品質を段階的に下げる。
export function fileToCompressedDataURL(file, opts = {}) {
  // 画質優先の既定値。Firestore の1ドキュメント上限(約1MB)ぎりぎりまで使う。
  const maxDim = opts.maxDim || 1600;
  let quality = opts.quality || 0.85;
  const maxLen = opts.maxLen || 1000 * 1000; // dataURL文字列長の上限（≒バイト）。1MB制限内で最大化

  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("画像ファイルを選択してください。"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // 指定の寸法・品質でJPEGのdataURLを作る
      const render = (dimension, q) => {
        let { width, height } = img;
        if (width > dimension || height > dimension) {
          const s = dimension / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", q);
      };
      let dim = maxDim;
      let q = quality;
      let dataUrl = render(dim, q);
      // まず品質を段階的に下げ（0.5まで）、それでも大きければ寸法を下げる（画質優先）
      while (dataUrl.length > maxLen) {
        if (q > 0.5) q = Math.max(0.5, q - 0.07);
        else if (dim > 800) { dim = Math.round(dim * 0.85); q = quality; }
        else break;
        dataUrl = render(dim, q);
      }
      if (dataUrl.length > maxLen) {
        reject(new Error("画像サイズが大きすぎます。別の写真をお試しください。"));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗しました。"));
    };
    img.src = url;
  });
}

// 既存の dataURL から小さいサムネイル dataURL を作る（一覧の軽量表示用）
export function dataUrlToThumb(dataUrl, maxDim = 420, quality = 0.55) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const s = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * s);
      height = Math.round(height * s);
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      c.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// dataURL をファイルとして保存（学生側の「保存」ボタン用）
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "photo.jpg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
