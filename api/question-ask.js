import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireUser } from "./_lib/util.js";

// 学生が質問を投稿する（Admin SDK で書き込むため Firestore ルールの追加は不要）
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const user = await requireUser(req);
  if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });

  const { text } = await readJson(req);
  const t = String(text || "").trim();
  if (!t) return sendJson(res, 400, { error: "質問を入力してください。" });
  if (t.length > 1000) return sendJson(res, 400, { error: "質問が長すぎます（1000文字以内）。" });

  const sdoc = await dbAdmin.collection("students").doc(user.uid).get();
  const s = sdoc.exists ? sdoc.data() : {};

  await dbAdmin.collection("questions").add({
    uid: user.uid,
    name: s.name || "",
    grad: s.grad || null,
    text: t,
    answer: null,
    answeredAt: null,
    public: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return sendJson(res, 200, { ok: true });
}
