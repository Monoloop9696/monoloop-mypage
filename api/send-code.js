import { dbAdmin, authAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard } from "./_lib/util.js";
import { sendEmail } from "./_lib/resend.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10分
const RESEND_COOLDOWN_MS = 30 * 1000;

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const { email, initialPassword, grad } = await readJson(req);
    const normEmail = String(email || "").trim().toLowerCase();
    const y = Number(grad);

    if (!normEmail.includes("@")) {
      return sendJson(res, 400, { error: "メールアドレスの形式が正しくありません。" });
    }
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return sendJson(res, 400, { error: "卒年度が不正です。" });
    }

    // 卒年度マスタ（cohorts）から照合。存在しない/停止中は受付不可。
    const cohortSnap = await dbAdmin.collection("cohorts").doc(String(y)).get();
    if (!cohortSnap.exists || cohortSnap.data().active !== true) {
      return sendJson(res, 400, {
        error: "この卒年度は現在登録を受け付けていません。採用担当にご確認ください。",
      });
    }
    const expected = cohortSnap.data().initialPassword;
    if (initialPassword !== expected) {
      // 別年度のパスワードなら年度不一致メッセージ
      const q = await dbAdmin
        .collection("cohorts")
        .where("initialPassword", "==", initialPassword)
        .where("active", "==", true)
        .limit(1)
        .get();
      if (!q.empty && q.docs[0].data().year !== y) {
        return sendJson(res, 400, {
          error: `この初期パスワードは${q.docs[0].data().year}年卒向けです。${y}年卒の案内に記載のパスワードをご確認ください。`,
        });
      }
      return sendJson(res, 400, {
        error: "初期パスワードが正しくありません。採用担当からの案内をご確認ください。",
      });
    }

    // 既登録チェック
    try {
      await authAdmin.getUserByEmail(normEmail);
      return sendJson(res, 409, { code: "already-registered", error: "このメールアドレスは登録済みです。" });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    // 再送クールダウン
    const ref = dbAdmin.collection("authCodes").doc(normEmail);
    const existing = await ref.get();
    if (existing.exists) {
      const prev = existing.data();
      if (prev.createdAtMs && Date.now() - prev.createdAtMs < RESEND_COOLDOWN_MS) {
        return sendJson(res, 429, { error: "コードの再送は少し時間をおいてからお試しください。" });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await ref.set({
      code,
      grad: y,
      passwordOk: true,
      expiresAt: Date.now() + CODE_TTL_MS,
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });

    await sendEmail({
      to: normEmail,
      subject: "【モノ・ループ】マイページ登録の認証コード",
      text:
        `モノ・ループ内定者マイページの登録を続けるための認証コードです。\n\n` +
        `認証コード：${code}\n\n` +
        `※ このコードの有効期限は10分です。\n` +
        `※ お心当たりのない場合はこのメールを破棄してください。\n\n` +
        `モノ・ループ株式会社 採用担当`,
    });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { error: "認証コードの送信に失敗しました。時間をおいて再度お試しください。" });
  }
}
