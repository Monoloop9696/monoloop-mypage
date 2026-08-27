import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";
import { multicast, pushMessage } from "./_lib/line.js";
import { sendEmail } from "./_lib/resend.js";

// タスク未完了者判定のための進捗計算
async function computeIncompleteUids(grad) {
  const [evSnap, svSnap, rsvpSnap, respSnap] = await Promise.all([
    dbAdmin.collection("events").where("grad", "==", grad).where("published", "==", true).get(),
    dbAdmin.collection("surveys").where("grad", "==", grad).where("published", "==", true).get(),
    dbAdmin.collection("rsvps").get(),
    dbAdmin.collection("responses").get(),
  ]);
  const eventIds = evSnap.docs.map((d) => d.id);
  const surveyIds = svSnap.docs.map((d) => d.id);
  const rsvpKey = new Set(rsvpSnap.docs.map((d) => { const r = d.data(); return `${r.eventId}_${r.uid}`; }));
  const respKey = new Set(respSnap.docs.map((d) => { const r = d.data(); return `${r.surveyId}_${r.uid}`; }));
  return { eventIds, surveyIds, rsvpKey, respKey };
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  try {
    const { target, targetLabel, body, grad, lineOnly } = await readJson(req);
    const y = Number(grad);
    const text = String(body || "").trim();
    if (!text) return sendJson(res, 400, { error: "メッセージが空です。" });

    // 対象年度の在籍者（辞退・削除は除外）
    const snap = await dbAdmin.collection("students").where("grad", "==", y).get();
    let recipients = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => !s.deleted && (s.status === "内定" || s.status === "承諾"));

    if (typeof target === "string" && target.startsWith("event:")) {
      // イベント参加状況で絞り込み： event:<eventId>:<group>（group = yes/arrived/no/none）
      const [, eventId, group] = target.split(":");
      const rsnap = await dbAdmin.collection("rsvps").where("eventId", "==", eventId).get();
      const yes = new Set(), no = new Set(), arrived = new Set();
      rsnap.docs.forEach((d) => {
        const r = d.data();
        if (r.answer === "yes") yes.add(r.uid);
        else if (r.answer === "no") no.add(r.uid);
        if (r.arrived === true) arrived.add(r.uid); // 出席かつ当日到着ボタンを押した人
      });
      recipients = recipients.filter((s) => {
        if (group === "yes") return yes.has(s.id);
        if (group === "arrived") return arrived.has(s.id);
        if (group === "no") return no.has(s.id);
        return !yes.has(s.id) && !no.has(s.id); // none = 未回答
      });
    } else if (target === "内定者（承諾前）") {
      recipients = recipients.filter((s) => s.status === "内定");
    } else if (target === "内定承諾者") {
      recipients = recipients.filter((s) => s.status === "承諾");
    } else if (target === "タスク未完了者") {
      const { eventIds, surveyIds, rsvpKey, respKey } = await computeIncompleteUids(y);
      recipients = recipients.filter((s) => {
        const total = eventIds.length + surveyIds.length + 1;
        let done = 0;
        eventIds.forEach((eid) => { if (rsvpKey.has(`${eid}_${s.id}`)) done += 1; });
        surveyIds.forEach((sid) => { if (respKey.has(`${sid}_${s.id}`)) done += 1; });
        if (s.address && s.phone) done += 1;
        return done < total;
      });
    }

    // {name} / {名前} を各受信者のマイページ登録名に置換（差し込み）
    const hasPlaceholder = /\{name\}|\{名前\}/i.test(text);
    const personalize = (t, s) => t.replace(/\{name\}|\{名前\}/gi, s.name || "");

    const lineRecipients = recipients.filter((s) => s.lineUserId);
    const mailUsers = recipients.filter((s) => !s.lineUserId && s.email);

    // LINE：差し込みがある場合は1人ずつ個別送信（push）、無ければ従来どおり multicast
    let lineCount = 0;
    if (lineRecipients.length) {
      if (hasPlaceholder) {
        for (const s of lineRecipients) {
          try { if (await pushMessage(s.lineUserId, personalize(text, s))) lineCount += 1; }
          catch { /* 個別送信失敗はスキップ */ }
        }
      } else {
        lineCount = await multicast(lineRecipients.map((s) => s.lineUserId), text);
      }
    }

    // lineOnly の場合はメール送信をスキップ（記事のLINE通知など、LINEのみ送りたいケース）
    let mailCount = 0;
    if (!lineOnly) {
      for (const s of mailUsers) {
        try {
          await sendEmail({
            to: s.email,
            subject: "【モノ・ループ】お知らせ",
            text: `${s.name || ""}さん\n\n${personalize(text, s)}\n\n──────────\nモノ・ループ株式会社 採用担当\n※ 本メールはマイページ未連携の方へお送りしています。`,
          });
          mailCount += 1;
        } catch {
          /* 個別メール失敗はスキップ */
        }
      }
    }

    // 配信ログ（宛先の氏名も記録：あとで履歴から「誰に送ったか」を確認できる）
    await dbAdmin.collection("broadcasts").add({
      target: targetLabel || target || "全員",
      body: text,
      grad: y,
      count: recipients.length,
      lineCount,
      mailCount,
      lineNames: lineRecipients.map((s) => s.name || "（名前なし）"),
      mailNames: mailUsers.map((s) => s.name || "（名前なし）"),
      sentBy: admin.email || null,
      sentAt: FieldValue.serverTimestamp(),
    });

    return sendJson(res, 200, {
      count: recipients.length,
      lineCount,
      mailCount,
    });
  } catch (err) {
    return sendJson(res, 500, { error: "配信に失敗しました。時間をおいて再度お試しください。" });
  }
}
