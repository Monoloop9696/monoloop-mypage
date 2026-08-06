import { dbAdmin } from "./_lib/firebaseAdmin.js";
import { readRawBody, sendJson } from "./_lib/util.js";
import { verifyLineSignature, replyMessage } from "./_lib/line.js";

// Vercel の body パーサを使わず生ボディで署名検証する
export const config = { api: { bodyParser: false } };

const CODE_RE = /^MN-[A-Z0-9]{4}$/;

async function bindLinkCode(code, lineUserId, replyToken) {
  const q = await dbAdmin
    .collection("students")
    .where("linkCode", "==", code)
    .limit(1)
    .get();

  // コードが見つからない・無効アカウントの場合は返信せず終了（送信は連携完了時のみ）
  if (q.empty) return;
  const docRef = q.docs[0].ref;
  const st = q.docs[0].data();
  if (st.deleted) return;
  await docRef.update({ lineUserId });
  await replyMessage(replyToken, `${st.name || ""}さん、LINE連携が完了しました。今後、イベントのリマインドや大切なお知らせをこちらにお届けします。`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method Not Allowed" });

  const raw = await readRawBody(req);
  const signature = req.headers["x-line-signature"];
  if (!verifyLineSignature(raw, signature)) {
    return sendJson(res, 401, { error: "invalid signature" });
  }

  let payload = {};
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return sendJson(res, 200, { ok: true });
  }

  const events = payload.events || [];
  await Promise.all(
    events.map(async (ev) => {
      try {
        const userId = ev.source && ev.source.userId;
        // メッセージは「連携完了時」の1通のみ。友だち追加(follow)や
        // その他のユーザー送信メッセージには返信しない。
        if (ev.type === "message" && ev.message && ev.message.type === "text" && ev.replyToken) {
          const text = String(ev.message.text || "").trim().toUpperCase();
          if (CODE_RE.test(text) && userId) {
            await bindLinkCode(text, userId, ev.replyToken);
          }
        }
      } catch {
        /* 個別イベントの失敗は握りつぶし、Webhook全体は200を返す */
      }
    })
  );

  return sendJson(res, 200, { ok: true });
}
