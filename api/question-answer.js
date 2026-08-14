import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";
import { pushMessage } from "./_lib/line.js";

// 管理者：質問への回答／公開切替／削除。初回回答時は質問者の公式LINEへ通知
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  const { id, answer, isPublic, remove } = await readJson(req);
  if (!id) return sendJson(res, 400, { error: "id が必要です。" });

  const ref = dbAdmin.collection("questions").doc(id);
  const doc = await ref.get();
  if (!doc.exists) return sendJson(res, 404, { error: "質問が見つかりません。" });

  if (remove === true) {
    await ref.delete();
    return sendJson(res, 200, { ok: true, removed: true });
  }

  const prev = doc.data();
  const ans = String(answer || "").trim();
  const patch = { public: isPublic === true };
  let notify = false;
  if (ans) {
    patch.answer = ans;
    patch.answeredAt = FieldValue.serverTimestamp();
    patch.answeredBy = admin.email || null;
    if (!prev.answer) notify = true; // 初回回答時のみ通知
  }
  await ref.update(patch);

  let notified = false;
  if (notify && prev.uid) {
    try {
      const sdoc = await dbAdmin.collection("students").doc(prev.uid).get();
      const lineUserId = sdoc.exists ? sdoc.data().lineUserId : null;
      if (lineUserId) {
        await pushMessage(lineUserId, "ご質問への回答が届きました。マイページの「質問箱」からご確認ください。");
        notified = true;
      }
    } catch { /* 通知失敗は無視 */ }
  }

  return sendJson(res, 200, { ok: true, notified });
}
