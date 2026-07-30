import { authAdmin } from "./_lib/firebaseAdmin.js";
import { sendJson, methodGuard, adminEmails } from "./_lib/util.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const header = req.headers.authorization || "";
    const m = header.match(/^Bearer (.+)$/);
    if (!m) return sendJson(res, 401, { error: "認証が必要です。" });

    const decoded = await authAdmin.verifyIdToken(m[1]);
    const email = (decoded.email || "").toLowerCase();
    const shouldBeAdmin = adminEmails().includes(email);
    const currentlyAdmin = decoded.admin === true;

    if (shouldBeAdmin !== currentlyAdmin) {
      await authAdmin.setCustomUserClaims(decoded.uid, { admin: shouldBeAdmin });
    }
    return sendJson(res, 200, { admin: shouldBeAdmin });
  } catch (err) {
    return sendJson(res, 401, { error: "認証に失敗しました。" });
  }
}
