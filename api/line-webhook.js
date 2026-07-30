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

  if (q.empty) {
    await replyMessage(replyToken, "連携コードが見つかりませんでした。マイページの「LINE連携」に表示されているコード（MN-XXXX）をご確認のうえ、もう一度送信してください。");
    return;
  }
  const docRef = q.docs[0].ref;
  const st = q.docs[0].data();
  if (st.deleted) {
    await replyMessage(replyToken, "このアカウントは現在ご利用いただけません。採用担当までお問い合わせください。");
    return;
  }
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
        if (ev.type === "follow" && ev.replyToken) {
          await replyMessage(
            ev.replyToken,
            "モノ・ループ公式アカウントへようこそ。マイページの「LINE連携」に表示されている連携コード（MN-XXXX）をこのトークに送信してください。"
          );
        } else if (ev.type === "message" && ev.message && ev.message.type === "text" && ev.replyToken) {
          const text = String(ev.message.text || "").trim().toUpperCase();
          if (CODE_RE.test(text) && userId) {
            await bindLinkCode(text, userId, ev.replyToken);
          } else {
            await replyMessage(
              ev.replyToken,
              "連携するには、マイページの「LINE連携」に表示されている連携コード（MN-XXXX）を送信してください。"
            );
          }
        }
      } catch {
        /* 個別イベントの失敗は握りつぶし、Webhook全体は200を返す */
      }
    })
  );

  return sendJson(res, 200, { ok: true });
}
