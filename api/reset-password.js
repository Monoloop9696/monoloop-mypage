import { authAdmin } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard } from "./_lib/util.js";
import { sendEmail } from "./_lib/resend.js";

// パスワード再設定メールを Resend（認証済みドメイン no-reply@monoloop.jp）から送る。
// 再設定リンク自体は Firebase の標準アクションページを使用（generatePasswordResetLink）。
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const { email } = await readJson(req);
    const normEmail = String(email || "").trim().toLowerCase();
    if (!normEmail.includes("@")) {
      return sendJson(res, 400, { error: "メールアドレスの形式が正しくありません。" });
    }

    let link;
    try {
      await authAdmin.getUserByEmail(normEmail);
      const rawLink = await authAdmin.generatePasswordResetLink(normEmail);
      // Firebaseの英語ページではなく、アプリ内の日本語ページ /reset-confirm に oobCode を渡す
      const oob = new URL(rawLink).searchParams.get("oobCode");
      const host = req.headers.host || "";
      const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
      link = oob
        ? `${proto}://${host}/reset-confirm?oobCode=${encodeURIComponent(oob)}`
        : rawLink;
    } catch (e) {
      // 未登録アドレスは、存在有無を漏らさないため成功として返し何も送らない
      if (e.code === "auth/user-not-found") return sendJson(res, 200, { ok: true });
      throw e;
    }

    await sendEmail({
      to: normEmail,
      subject: "【モノ・ループ】パスワード再設定のご案内",
      text:
        `モノ・ループ マイページのパスワード再設定のご依頼を受け付けました。\n\n` +
        `下記のリンクを開き、新しいパスワードを設定してください（リンクは一定時間で失効します）。\n\n` +
        `${link}\n\n` +
        `※ お心当たりのない場合は、このメールを破棄してください。パスワードは変更されません。\n\n` +
        `モノ・ループ株式会社 採用担当`,
    });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { error: "再設定メールの送信に失敗しました。時間をおいて再度お試しください。" });
  }
}
