import { authAdmin } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";

// 管理者のみ。関数上限(12)対策で1関数に集約：
//   action 省略 … 学生 Auth アカウントの無効化/有効化（退会・復元）
//   action="lastLogin" … 指定uidの最終ログイン日時・アカウント作成日時を返す
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: "リクエストの解析に失敗しました。" });
  }

  // ---- 最終ログイン日時（Firebase Auth のメタデータ。過去の分も遡って取得できる）----
  if (body && body.action === "lastLogin") {
    try {
      const uids = Array.isArray(body.uids) ? body.uids.filter(Boolean).slice(0, 1000) : [];
      const users = {};
      for (let i = 0; i < uids.length; i += 100) {
        // getUsers は1回あたり100件まで
        const r = await authAdmin.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
        for (const u of r.users) {
          users[u.uid] = {
            lastSignInTime: (u.metadata && u.metadata.lastSignInTime) || null,
            creationTime: (u.metadata && u.metadata.creationTime) || null,
            disabled: !!u.disabled,
          };
        }
      }
      return sendJson(res, 200, { users });
    } catch (err) {
      return sendJson(res, 500, { error: "ログイン状況の取得に失敗しました。" });
    }
  }

  // ---- アカウントの無効化/有効化 ----
  try {
    const { uid, disabled } = body || {};
    if (!uid) return sendJson(res, 400, { error: "uid が必要です。" });
    await authAdmin.updateUser(uid, { disabled: disabled === true });
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { error: "アカウント状態の更新に失敗しました。" });
  }
}
