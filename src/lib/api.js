// serverless functions（/api/*）を呼ぶための薄いラッパー
import { auth } from "../firebase";

async function post(path, body, { authed = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authed) {
    const user = auth.currentUser;
    if (!user) throw new Error("ログインが必要です。");
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ボディなし */
  }
  if (!res.ok) {
    const message = (data && data.error) || `通信に失敗しました（${res.status}）`;
    const err = new Error(message);
    err.code = data && data.code;
    throw err;
  }
  return data || {};
}

// 登録：初期パスワード照合＋認証コード送信
export const sendCode = (payload) => post("/api/send-code", payload);

// 登録：認証コード＋本人情報でアカウント作成
export const registerAccount = (payload) => post("/api/register", payload);

// 公開：有効な卒年度一覧（/signup の年度チェック用。パスワードは含まれない）
export const publicCohorts = () => post("/api/public-cohorts", {});

// パスワード再設定メール（Resend経由。存在有無に関わらず ok を返す）
export const resetPassword = (payload) => post("/api/reset-password", payload);

// ログイン後：admin クレーム付与（該当メールのみ）。{ admin: boolean } を返す
export const syncRole = () => post("/api/set-role", {}, { authed: true });

// 管理者：学生アカウントの無効化/有効化（退会・復元）
export const setStudentAccount = (payload) =>
  post("/api/student-account", payload, { authed: true });

// 管理者：LINE一括配信（未連携者はメール送信）
export const lineBroadcast = (payload) =>
  post("/api/line-broadcast", payload, { authed: true });
