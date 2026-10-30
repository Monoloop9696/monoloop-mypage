import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireAdmin } from "./_lib/util.js";
import { multicast, pushMessage } from "./_lib/line.js";
import { sendEmail } from "./_lib/resend.js";
import { resolveRecipients } from "./_lib/broadcastTarget.js";

// タスク未完了者（公開イベントの出欠・公開アンケートの回答・住所電話のいずれかが未完了）の uid 一覧
async function computeIncompleteUids(grad, students) {
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
  return students
    .filter((s) => {
      const total = eventIds.length + surveyIds.length + 1;
      let done = 0;
      eventIds.forEach((eid) => { if (rsvpKey.has(`${eid}_${s.id}`)) done += 1; });
      surveyIds.forEach((sid) => { if (respKey.has(`${sid}_${s.id}`)) done += 1; });
      if (s.address && s.phone) done += 1;
      return done < total;
    })
    .map((s) => s.id);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  try {
    const { target, targetLabel, body, grad, lineOnly, uids } = await readJson(req);
    const y = Number(grad);
    const text = String(body || "").trim();
    if (!text) return sendJson(res, 400, { error: "メッセージが空です。" });
    if (!Number.isFinite(y)) return sendJson(res, 400, { error: "年度が不正です。" });

    // 対象年度の学生（在籍者への絞り込みは resolveRecipients 側）
    const snap = await dbAdmin.collection("students").where("grad", "==", y).get();
    const students = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 送信先の決定。管理画面は確認モーダルに出した名簿の uid をそのまま渡す（＝見えている名簿に送る）。
    // uids が無い呼び出し（記事のLINE通知など）は target 文字列で絞る。不明な対象は 400（全員には落とさない）
    const recipients = await resolveRecipients({
      students,
      target,
      uids,
      loaders: {
        event: async (id) => { const d = await dbAdmin.collection("events").doc(id).get(); return d.exists ? { id: d.id, ...d.data() } : null; },
        rsvps: async (eventId) => (await dbAdmin.collection("rsvps").where("eventId", "==", eventId).get()).docs.map((d) => d.data()),
        survey: async (id) => { const d = await dbAdmin.collection("surveys").doc(id).get(); return d.exists ? { id: d.id, ...d.data() } : null; },
        answeredUids: async (surveyId) => (await dbAdmin.collection("responses").where("surveyId", "==", surveyId).get()).docs.map((d) => d.data().uid),
        incompleteUids: async () => computeIncompleteUids(y, students.filter((s) => !s.deleted && (s.status === "内定" || s.status === "承諾"))),
      },
    });

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
    if (err && err.status === 400) return sendJson(res, 400, { error: err.message });
    return sendJson(res, 500, { error: "配信に失敗しました。時間をおいて再度お試しください。" });
  }
}
