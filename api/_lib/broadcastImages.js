// LINE配信に添付する画像の純粋ロジック（検証・URL・LINEメッセージの組み立て）。
// 画像の実体は Firestore の bcFiles コレクションに Admin SDK だけで読み書きする
// （クライアントは firestore.rules の「それ以外は全拒否」で触れない＝ルール変更不要）。
// LINE の画像メッセージは「公開された HTTPS の画像URL」が必要なので、
// /bc-img/<id>.jpg（vercel.json の rewrite → /api/public-cohorts?img=<id>）で配る。

export const MAX_IMAGES = 3; // LINE は1回の送信で5メッセージまで（本文1＋画像）。余裕をみて3枚
export const MAX_IMAGE_BYTES = 900 * 1000; // Firestore の1ドキュメント上限（1MiB）に収める

const bad = (msg) => {
  const err = new Error(msg);
  err.status = 400;
  return err;
};

// dataURL の配列 → [{ mime, buffer }]。JPEG/PNG 以外・大きすぎ・多すぎは 400
export function parseImages(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw bad("添付画像の指定が不正です。");
  if (list.length > MAX_IMAGES) throw bad(`添付できる画像は${MAX_IMAGES}枚までです。`);
  return list.map((d, i) => {
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ""));
    if (!m) throw bad(`${i + 1}枚目の画像の形式が不正です（JPEG・PNGのみ添付できます）。`);
    const buffer = Buffer.from(m[2], "base64");
    if (!buffer.length) throw bad(`${i + 1}枚目の画像を読み取れませんでした。`);
    if (buffer.length > MAX_IMAGE_BYTES) throw bad(`${i + 1}枚目の画像が大きすぎます。別の画像をお試しください。`);
    return { mime: m[1], buffer };
  });
}

// 公開URL（拡張子つき）
export const imageUrl = (base, id, mime) =>
  `${String(base || "").replace(/\/+$/, "")}/bc-img/${id}.${mime === "image/png" ? "png" : "jpg"}`;

// LINE に送るメッセージの並び（本文 → 画像）。通数は宛先の人数で数えられ、画像を付けても増えない
export const buildLineMessages = (text, urls = []) => [
  { type: "text", text },
  ...urls.map((u) => ({ type: "image", originalContentUrl: u, previewImageUrl: u })),
];

// 未連携の方へのメール本文の末尾に付ける画像リンク
export const mailImageNote = (urls = []) =>
  (urls.length ? `\n\n▼添付画像（${urls.length}枚・タップで開きます）\n${urls.join("\n")}` : "");

// 画像を返すリクエストからIDを取り出す。
//   /bc-img/<id>.jpg（rewrite 後は query.img に入る）／/api/public-cohorts?img=<id>
export function imageIdFromRequest(req) {
  let raw = "";
  if (req && req.query && typeof req.query.img === "string") raw = req.query.img;
  if (!raw && req && req.url) {
    try { raw = new URL(req.url, "http://localhost").searchParams.get("img") || ""; } catch { raw = ""; }
    if (!raw) {
      const m = /\/bc-img\/([^/?#]+)/.exec(req.url);
      if (m) raw = m[1];
    }
  }
  const id = String(raw).replace(/\.(jpe?g|png)$/i, "");
  return /^[A-Za-z0-9]{10,40}$/.test(id) ? id : "";
}
