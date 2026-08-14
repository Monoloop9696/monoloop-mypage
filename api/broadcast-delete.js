import { dbAdmin } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";

// 管理者：配信履歴(broadcasts)の1件削除。クライアント直書きは不可のため API 経由。
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  const { id } = await readJson(req);
  if (!id) return sendJson(res, 400, { error: "id が必要です。" });

  await dbAdmin.collection("broadcasts").doc(id).delete();
  return sendJson(res, 200, { ok: true });
}
