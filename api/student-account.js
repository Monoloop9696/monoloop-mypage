import { authAdmin } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";

// 管理者のみ：学生 Auth アカウントの無効化/有効化（退会・復元）
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  try {
    const { uid, disabled } = await readJson(req);
    if (!uid) return sendJson(res, 400, { error: "uid が必要です。" });
    await authAdmin.updateUser(uid, { disabled: disabled === true });
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 500, { error: "アカウント状態の更新に失敗しました。" });
  }
}
