import { dbAdmin } from "./_lib/firebaseAdmin.js";
import { sendJson, methodGuard, requireUser, adminEmails } from "./_lib/util.js";

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

// 質問一覧。管理者は全件、学生は「自分の質問」＋「公開FAQ（匿名）」を返す
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const user = await requireUser(req);
  if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });

  const email = (user.email || "").toLowerCase();
  const isAdmin = user.admin === true || adminEmails().includes(email);

  const snap = await dbAdmin.collection("questions").get();
  const all = snap.docs.map(serialize).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (isAdmin) return sendJson(res, 200, { admin: true, all });

  const mine = all.filter((q) => q.uid === user.uid);
  // 公開FAQ は氏名を伏せて質問文と回答のみ
  const faq = all
    .filter((q) => q.public && q.answer)
    .map((q) => ({ id: q.id, text: q.text, answer: q.answer, answeredAt: q.answeredAt }));

  return sendJson(res, 200, { admin: false, mine, faq });
}
