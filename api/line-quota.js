import { sendJson, methodGuard, requireAdmin } from "./_lib/util.js";

// 管理者：今月のLINE送信数（無料プランは200/月・毎月リセット）を LINE 公式APIから取得。
//   /message/quota        → { type: "limited"|"none", value }
//   /message/quota/consumption → { totalUsage }
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return sendJson(res, 500, { error: "LINEトークンが未設定です。" });
  const H = { Authorization: `Bearer ${token}` };

  try {
    const [qRes, cRes] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: H }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: H }),
    ]);
    const q = await qRes.json();
    const c = await cRes.json();
    const type = q.type || "none";                    // limited=上限あり / none=無制限
    const limit = type === "limited" ? (q.value ?? null) : null;
    const used = c.totalUsage ?? 0;
    const remaining = limit != null ? Math.max(0, limit - used) : null;
    return sendJson(res, 200, { type, limit, used, remaining });
  } catch (e) {
    return sendJson(res, 500, { error: "送信数の取得に失敗しました。" });
  }
}
