import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireUser, requireAdmin, adminEmails } from "./_lib/util.js";
import { pushMessage } from "./_lib/line.js";

// 質問箱の統合エンドポイント（Vercel無料プランの関数数上限対策で ask/list/answer を1関数に集約）
//   { action: "ask" }    学生：質問投稿 { text }
//   { action: "list" }   一覧：管理者=全件 / 学生=自分＋公開FAQ
//   { action: "answer" } 管理者：回答/公開/削除 { id, answer, isPublic, remove }
function serialize(d) {
  const q = d.data();
  return {
    id: d.id,
    uid: q.uid,
    name: q.name || "",
    grad: q.grad || null,
    text: q.text || "",
    answer: q.answer || null,
    public: q.public === true,
    createdAt: q.createdAt?.toMillis ? q.createdAt.toMillis() : null,
    answeredAt: q.answeredAt?.toMillis ? q.answeredAt.toMillis() : null,
  };
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const body = await readJson(req);
  const action = body.action;

  // ---- 投稿（学生） ----
  if (action === "ask") {
    const user = await requireUser(req);
    if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });
    const t = String(body.text || "").trim();
    if (!t) return sendJson(res, 400, { error: "質問を入力してください。" });
    if (t.length > 1000) return sendJson(res, 400, { error: "質問が長すぎます（1000文字以内）。" });
    const sdoc = await dbAdmin.collection("students").doc(user.uid).get();
    const s = sdoc.exists ? sdoc.data() : {};
    await dbAdmin.collection("questions").add({
      uid: user.uid, name: s.name || "", grad: s.grad || null,
      text: t, answer: null, answeredAt: null, public: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return sendJson(res, 200, { ok: true });
  }

  // ---- 一覧 ----
  if (action === "list") {
    const user = await requireUser(req);
    if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });
    const email = (user.email || "").toLowerCase();
    const isAdmin = user.admin === true || adminEmails().includes(email);
    const snap = await dbAdmin.collection("questions").get();
    const all = snap.docs.map(serialize).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (isAdmin) return sendJson(res, 200, { admin: true, all });
    const mine = all.filter((q) => q.uid === user.uid);
    const faq = all
      .filter((q) => q.public && q.answer)
      .map((q) => ({ id: q.id, text: q.text, answer: q.answer, answeredAt: q.answeredAt }));
    return sendJson(res, 200, { admin: false, mine, faq });
  }

  // ---- 回答／公開／削除（管理者） ----
  if (action === "answer") {
    const admin = await requireAdmin(req);
    if (!admin) return sendJson(res, 403, { error: "権限がありません。" });
    const { id, answer, isPublic, remove } = body;
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
      if (!prev.answer) notify = true;
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

  return sendJson(res, 400, { error: "不明なアクションです。" });
}
