import { dbAdmin } from "./_lib/firebaseAdmin.js";
import { sendJson, methodGuard } from "./_lib/util.js";

// 公開エンドポイント：/signup での年度有効性チェック用。
// initialPassword は絶対に返さない（year と active のみ）。
export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const snap = await dbAdmin.collection("cohorts").get();
    const cohorts = snap.docs
      .map((d) => {
        const c = d.data();
        return { year: c.year, active: c.active === true };
      })
      .sort((a, b) => a.year - b.year);
    return sendJson(res, 200, { cohorts });
  } catch (err) {
    return sendJson(res, 500, { error: "年度情報の取得に失敗しました。" });
  }
}
