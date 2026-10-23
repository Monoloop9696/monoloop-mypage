import { createHash } from "node:crypto";
import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, adminEmails } from "./_lib/util.js";
import { sendEmail } from "./_lib/resend.js";

// 公開エンドポイント（未ログインで呼べる）。Vercel の関数数上限（12）対策で action により分岐する。
//   action なし        : /signup での年度有効性チェック。initialPassword は絶対に返さない（year と active のみ）。
//   action=specialVerify: 特別選考LP（/special）の特別コード確認。コードの有無と状態だけ返す（媒体メモ等は返さない）。
//   action=specialEntry : 特別選考LPのエントリー登録。templates に _type:"specialEntry" で保存し、本人と管理者へメール。
// 特別コード・エントリーは templates（管理者のみ read/write）に置くので Firestore ルールの変更は不要。

const APP_URL = process.env.APP_URL || "https://monoloop-mypage.vercel.app";

// src/lib/specialRoute.js の SPECIAL_ROUTES と id・名前・案内文を揃えること
const SPECIAL_ROUTES = {
  special: { name: "特別選考ルート", next: "3営業日以内に、個別面談の日程についてメールでご連絡します。" },
  casual: { name: "カジュアル面談ルート", next: "3営業日以内に、面談の日程についてメールでご連絡します。" },
  talk: { name: "社員座談会ルート", next: "次回の座談会の日程と参加方法をメールでご連絡します。" },
};

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const normCode = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();
const clip = (s, n) => String(s || "").trim().slice(0, n);

// コードを確認して { ok, code, data } か { ok:false, reason } を返す
async function checkCode(raw) {
  const code = normCode(raw);
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) return { ok: false, reason: "not_found" };
  const snap = await dbAdmin.collection("templates").doc(`special_code_${code}`).get();
  if (!snap.exists || snap.data()._type !== "specialCode") return { ok: false, reason: "not_found" };
  const c = snap.data();
  if (c.active === false) return { ok: false, reason: "stopped" };
  if (c.expiresAt && c.expiresAt < todayJst()) return { ok: false, reason: "expired" };
  return { ok: true, code, data: c };
}

async function cohortsHandler(res) {
  const snap = await dbAdmin.collection("cohorts").get();
  const cohorts = snap.docs
    .map((d) => {
      const c = d.data();
      return { year: c.year, active: c.active === true };
    })
    .sort((a, b) => a.year - b.year);
  return sendJson(res, 200, { cohorts });
}

async function specialVerify(res, body) {
  const r = await checkCode(body.code);
  if (!r.ok) return sendJson(res, 200, { ok: false, reason: r.reason });
  return sendJson(res, 200, { ok: true, code: r.code });
}

async function specialEntry(res, body) {
  // ボット対策：画面に出さない入力欄（website）に値が入っていたら、保存せず成功扱いで返す
  if (body.website) return sendJson(res, 200, { ok: true });

  const r = await checkCode(body.code);
  if (!r.ok) return sendJson(res, 400, { error: "特別コードを確認できませんでした。もう一度コードを入力してください。", code: r.reason });

  const route = SPECIAL_ROUTES[body.route] ? body.route : null;
  const f = {
    name: clip(body.name, 40),
    kana: clip(body.kana, 60),
    univ: clip(body.univ, 60),
    faculty: clip(body.faculty, 60),
    grad: Number(body.grad) || null,
    email: clip(body.email, 120).toLowerCase(),
    phone: clip(body.phone, 20),
    question: clip(body.question, 400),
  };
  if (!route) return sendJson(res, 400, { error: "選考ルートを選んでください。" });
  if (!f.name || !f.kana || !f.univ) return sendJson(res, 400, { error: "必須項目が入力されていません。" });
  if (!/^[ァ-ヶー\s　]+$/.test(f.kana)) return sendJson(res, 400, { error: "フリガナは全角カタカナで入力してください。" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return sendJson(res, 400, { error: "メールアドレスの形式が正しくありません。" });
  if (f.phone && !/^\d{2,4}-\d{2,4}-\d{3,4}$/.test(f.phone)) return sendJson(res, 400, { error: "電話番号はハイフンつきで入力してください（例：090-1234-5678）。" });
  if (body.agree !== true) return sendJson(res, 400, { error: "個人情報の取り扱いへの同意が必要です。" });

  // 同じメールアドレスからの再エントリーは1件にまとめる（ルートや連絡先は最新に上書き、受付日時・対応状況は保持）
  const id = "special_entry_" + createHash("sha256").update(f.email).digest("hex").slice(0, 24);
  const ref = dbAdmin.collection("templates").doc(id);
  const prev = await ref.get();
  const payload = {
    _type: "specialEntry",
    ...f,
    route,
    code: r.code,
    codeLabel: r.data.label || "",
    agreedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (prev.exists) {
    await ref.set({ ...payload, resubmitCount: (prev.data().resubmitCount || 0) + 1 }, { merge: true });
  } else {
    await ref.set({ ...payload, status: "未対応", memo: "", resubmitCount: 0, createdAt: FieldValue.serverTimestamp() });
  }

  // メールは失敗してもエントリー自体は成功扱い
  const routeName = SPECIAL_ROUTES[route].name;
  const mails = [
    sendEmail({
      to: f.email,
      subject: "【モノ・ループ】特別選考ルートへのエントリーを受け付けました",
      text:
        `${f.name}さん\n\n` +
        `モノ・ループ株式会社 新卒採用です。\n` +
        `特別選考ルートへのエントリーを受け付けました。ありがとうございます。\n\n` +
        `選択したルート：${routeName}\n\n` +
        `${SPECIAL_ROUTES[route].next}\n` +
        `しばらく届かない場合は、迷惑メールフォルダもご確認ください。\n\n` +
        `※ お心当たりのない場合はこのメールを破棄してください。\n\n` +
        `モノ・ループ株式会社 採用担当`,
    }),
  ];
  const admins = adminEmails();
  if (admins.length) {
    mails.push(
      sendEmail({
        to: admins,
        subject: `【特別選考】${prev.exists ? "再エントリー" : "新しいエントリー"}：${f.name}さん（${routeName}）`,
        text:
          `特別選考LPから${prev.exists ? "再エントリー" : "エントリー"}がありました。\n\n` +
          `氏名：${f.name}（${f.kana}）\n大学：${f.univ}${f.faculty ? " " + f.faculty : ""}\n` +
          `ルート：${routeName}\nコード：${r.code}${r.data.label ? `（${r.data.label}）` : ""}\n\n` +
          `管理画面の「特別選考」タブで確認・対応してください。\n${APP_URL}/admin`,
      })
    );
  }
  const results = await Promise.allSettled(mails);
  results.forEach((x) => x.status === "rejected" && console.error("[special-entry] mail failed:", x.reason && x.reason.message));

  return sendJson(res, 200, { ok: true, mailSent: results[0].status === "fulfilled" });
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const body = await readJson(req);
    if (body.action === "specialVerify") return await specialVerify(res, body);
    if (body.action === "specialEntry") return await specialEntry(res, body);
    return await cohortsHandler(res);
  } catch (err) {
    console.error("[public-cohorts] error:", err && err.message);
    return sendJson(res, 500, { error: "処理に失敗しました。時間をおいて再度お試しください。" });
  }
}
