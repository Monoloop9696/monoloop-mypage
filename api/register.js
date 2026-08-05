import { dbAdmin, authAdmin, FieldValue, Timestamp } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard } from "./_lib/util.js";

const LINK_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字を除外

async function generateLinkCode() {
  for (let attempt = 0; attempt < 6; attempt++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += LINK_CHARS[Math.floor(Math.random() * LINK_CHARS.length)];
    const code = `MN-${s}`;
    const dup = await dbAdmin.collection("students").where("linkCode", "==", code).limit(1).get();
    if (dup.empty) return code;
  }
  return `MN-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const body = await readJson(req);
    const inviteEmail = String(body.inviteEmail || "").trim().toLowerCase();
    const accountEmail = String(body.accountEmail || "").trim().toLowerCase();
    const code = String(body.code || "").trim();
    const y = Number(body.grad);
    const password = String(body.password || "");
    const profile = body.profile || {};

    if (body.privacyConsent !== true) {
      return sendJson(res, 400, { error: "プライバシーポリシーへの同意が必要です。" });
    }
    if (!accountEmail.includes("@")) {
      return sendJson(res, 400, { error: "メールアドレスの形式が正しくありません。" });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: "パスワードは8文字以上で設定してください。" });
    }
    if (!profile.name || !profile.birth || !profile.univ || !profile.phone || !profile.address) {
      return sendJson(res, 400, { error: "必須項目が不足しています。" });
    }

    // 卒年度マスタ（cohorts）確認：存在し active であること。joinDate を取得。
    const cohortSnap = await dbAdmin.collection("cohorts").doc(String(y)).get();
    if (!cohortSnap.exists || cohortSnap.data().active !== true) {
      return sendJson(res, 400, { error: "この卒年度は現在登録を受け付けていません。" });
    }
    const joinDate = cohortSnap.data().joinDate || Timestamp.fromDate(new Date(y, 3, 1));

    // 認証コード検証
    const ref = dbAdmin.collection("authCodes").doc(inviteEmail);
    const snap = await ref.get();
    if (!snap.exists) {
      return sendJson(res, 400, { code: "invalid-code", error: "認証コードが見つかりません。もう一度お試しください。" });
    }
    const ac = snap.data();
    if (!ac.passwordOk || ac.grad !== y || ac.code !== code || Date.now() > ac.expiresAt) {
      return sendJson(res, 400, { code: "invalid-code", error: "認証コードが一致しないか、有効期限が切れています。" });
    }

    // 重複登録チェック（登録メール）
    try {
      await authAdmin.getUserByEmail(accountEmail);
      return sendJson(res, 409, { code: "already-registered", error: "このメールアドレスは登録済みです。" });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    const linkCode = await generateLinkCode();

    // Auth アカウント作成
    const userRecord = await authAdmin.createUser({
      email: accountEmail,
      password,
      displayName: profile.name,
    });

    // students ドキュメント作成
    await dbAdmin.collection("students").doc(userRecord.uid).set({
      name: profile.name,
      kana: profile.kana || "",
      univ: profile.univ,
      birth: profile.birth,
      email: accountEmail,
      phone: profile.phone,
      zip: profile.zip || "",
      address: profile.address,
      livesAtHome: profile.livesAtHome === true,
      homeZip: profile.homeZip || "",
      homeAddress: profile.homeAddress || "",
      grad: y,
      joinDate,
      status: "内定",
      deleted: false,
      lineUserId: null,
      linkCode,
      privacyConsentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // 使用済み認証コードを削除
    await ref.delete();

    return sendJson(res, 200, { ok: true, uid: userRecord.uid });
  } catch (err) {
    return sendJson(res, 500, { error: "登録処理に失敗しました。時間をおいて再度お試しください。" });
  }
}
