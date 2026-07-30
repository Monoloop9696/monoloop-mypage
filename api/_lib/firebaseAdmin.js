import admin from "firebase-admin";

// FIREBASE_SERVICE_ACCOUNT は「1行のJSON」または「base64化したJSON」のどちらも受け付ける
function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT が未設定です。");
  let text = raw.trim();
  if (!text.startsWith("{")) {
    // base64 とみなしてデコード
    text = Buffer.from(text, "base64").toString("utf8");
  }
  const json = JSON.parse(text);
  // 秘密鍵内の \n をエスケープ復元（環境変数経由で \n が文字列化されるケース）
  if (json.private_key && json.private_key.includes("\\n")) {
    json.private_key = json.private_key.replace(/\\n/g, "\n");
  }
  return json;
}

// serverless の再利用インスタンスで多重初期化しない
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount()),
  });
}

export const authAdmin = admin.auth();
export const dbAdmin = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
export default admin;
