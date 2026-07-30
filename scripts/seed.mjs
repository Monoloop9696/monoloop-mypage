// 初期データ投入スクリプト:
//   1) journeys/2027・journeys/2028 の初期ステップを作成
//   2) ADMIN_EMAILS のユーザーに admin カスタムクレームを付与（既にAuthに存在する場合）
//
// 実行: FIREBASE_SERVICE_ACCOUNT と ADMIN_EMAILS を .env に設定のうえ
//   npm run seed
//
// 注意: 管理者アカウントは先に Firebase Authentication（コンソール）で作成しておくこと。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import admin from "firebase-admin";

// ---- .env の簡易ローダー（既に環境変数があればそちらを優先） ----
function loadEnv() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = join(here, "..", ".env");
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* .env が無ければ環境変数のみ利用 */
  }
}
loadEnv();

function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT が未設定です。");
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const json = JSON.parse(text);
  if (json.private_key?.includes("\\n")) json.private_key = json.private_key.replace(/\\n/g, "\n");
  return json;
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
const db = admin.firestore();
const auth = admin.auth();

const JOURNEY_2027 = [
  { id: "j1", label: "内定承諾", desc: "ようこそ、モノループへ。", type: "accept" },
  { id: "j2", label: "基本情報の登録", desc: "入社書類のお届け先をご登録ください。", type: "profile" },
  { id: "j3", label: "内定者懇親会", desc: "8.7 FRI — 同期との顔合わせ。", type: "event" },
  { id: "j4", label: "入社前研修", desc: "10月より全3回、オンラインにて。", type: "static" },
  { id: "j5", label: "入社式", desc: "2027.4.1 — 新しい一歩を。", type: "static" },
];
const JOURNEY_2028 = [
  { id: "j101", label: "内定承諾", desc: "まずはここから。", type: "accept" },
  { id: "j102", label: "基本情報の登録", desc: "連絡先・お届け先をご登録ください。", type: "profile" },
  { id: "j103", label: "内定者面談", desc: "8.21 FRI — 1on1で何でも相談を。", type: "event" },
  { id: "j104", label: "入社前研修", desc: "2027年秋より順次ご案内します。", type: "static" },
  { id: "j105", label: "入社式", desc: "2028.4.1 — 新しい一歩を。", type: "static" },
];

async function seedJourneys() {
  await db.collection("journeys").doc("2027").set({ steps: JOURNEY_2027 }, { merge: true });
  await db.collection("journeys").doc("2028").set({ steps: JOURNEY_2028 }, { merge: true });
  console.log("✓ journeys/2027, journeys/2028 を作成しました");
}

// 既存の 2027/2028 を cohorts へ移行（初期パスワードは環境変数から引き継ぐ）。既存はスキップ。
async function seedCohorts() {
  for (const y of [2027, 2028]) {
    const ref = db.collection("cohorts").doc(String(y));
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`… cohorts/${y} は既存（スキップ）`);
      continue;
    }
    const pw = process.env[`INITIAL_PASSWORD_${y}`] || "";
    if (!pw) console.log(`  ⚠ INITIAL_PASSWORD_${y} が未設定。空パスワードで作成します`);
    await ref.set({
      year: y,
      initialPassword: pw,
      joinDate: admin.firestore.Timestamp.fromDate(new Date(y, 3, 1)),
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✓ cohorts/${y} を作成（initialPassword: 環境変数より）`);
  }
}

async function grantAdminClaims() {
  const emails = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const email of emails) {
    try {
      const u = await auth.getUserByEmail(email);
      await auth.setCustomUserClaims(u.uid, { admin: true });
      console.log(`✓ 管理者クレームを付与: ${email}`);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        console.log(`… 未作成の管理者アカウント: ${email}（先に Firebase Authentication で作成してください）`);
      } else {
        console.log(`× ${email}: ${e.message}`);
      }
    }
  }
}

(async () => {
  await seedCohorts();
  await seedJourneys();
  await grantAdminClaims();
  console.log("完了しました。");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
