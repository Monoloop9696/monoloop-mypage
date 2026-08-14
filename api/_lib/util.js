import { authAdmin } from "./firebaseAdmin.js";

// 生ボディを Buffer で取得（LINE署名検証に必要）。Vercel の Node 関数は
// /api/* をフレームワーク非依存で扱うため、ここで自前にストリームを読む。
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    if (req.body && typeof req.body === "object") {
      // 既にパース済みの場合は再シリアライズ（署名検証には非推奨だが後方互換）
      return resolve(Buffer.from(JSON.stringify(req.body)));
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson(req) {
  const buf = await readRawBody(req);
  if (!buf || buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return {};
  }
}

export function sendJson(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export function methodGuard(req, res, method = "POST") {
  if (req.method !== method) {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return false;
  }
  return true;
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Bearer トークンを検証し、ログイン済みユーザーなら decodedToken を返す（管理者/学生問わず）
export async function requireUser(req) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    return await authAdmin.verifyIdToken(m[1]);
  } catch {
    return null;
  }
}

// Bearer トークンを検証し、管理者クレームまたは ADMIN_EMAILS に該当すれば decodedToken を返す
export async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return null;
  let decoded;
  try {
    decoded = await authAdmin.verifyIdToken(m[1]);
  } catch {
    return null;
  }
  const email = (decoded.email || "").toLowerCase();
  const isAdmin = decoded.admin === true || adminEmails().includes(email);
  return isAdmin ? decoded : null;
}
