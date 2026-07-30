import crypto from "crypto";

const LINE_API = "https://api.line.me/v2/bot";

// Webhook 署名検証（本文の生バイト列で HMAC-SHA256 → base64）
export function verifyLineSignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // タイミング安全比較
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function accessToken() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です。");
  return t;
}

export async function replyMessage(replyToken, text) {
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  return res.ok;
}

export async function pushMessage(to, text) {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  return res.ok;
}

// マルチキャスト（最大500件/回）。件数が多い場合は分割送信。
export async function multicast(userIds, text) {
  const ids = [...new Set(userIds)].filter(Boolean);
  let sent = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await fetch(`${LINE_API}/message/multicast`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: chunk, messages: [{ type: "text", text }] }),
    });
    if (res.ok) sent += chunk.length;
  }
  return sent;
}
