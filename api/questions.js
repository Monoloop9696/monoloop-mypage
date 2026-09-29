import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, requireUser, requireAdmin, adminEmails } from "./_lib/util.js";
import { pushMessage } from "./_lib/line.js";

// 質問箱＋面談予約の統合エンドポイント
// （Vercel無料プランの関数数上限対策で、学生が呼ぶ処理をこの1関数に集約している）
//   { action: "ask" }            学生：質問投稿 { text }
//   { action: "list" }           一覧：管理者=全件 / 学生=自分＋公開FAQ
//   { action: "answer" }         管理者：回答/公開/削除 { id, answer, isPublic, remove }
//   { action: "bookInterview" }  学生：面談の候補日時から1つ選んで予約 { id, slotId }

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
// 「2026. 8.7.(金) 16:30 - 17:00 (30分)」の形式
function slotLabel(slot) {
  const [y, m, d] = String(slot.date || "").split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const w = Number.isNaN(dt.getTime()) ? "" : WEEK[dt.getDay()];
  const mins = (() => {
    const toMin = (t) => {
      const [hh, mm] = String(t || "").split(":").map(Number);
      return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
    };
    const a = toMin(slot.start); const b = toMin(slot.end);
    return a != null && b != null && b > a ? b - a : null;
  })();
  return `${y}. ${m}.${d}.(${w}) ${slot.start} - ${slot.end}${mins ? ` (${mins}分)` : ""}`;
}
// 予約完了時に学生の公式LINEへ送る文面
function bookingMessage(req, slot) {
  const lines = [
    "ご連絡ありがとうございます！",
    "それでは以下日程にて行いますのでよろしくお願いいたします😊",
    "※私服で問題ございません！",
    "",
    "【日時】",
    slotLabel(slot),
    "",
  ];
  if (req.zoomUrl) {
    lines.push("【ZOOMURL】", req.zoomUrl);
    if (req.zoomId) lines.push(`ミーティング ID: ${req.zoomId}`);
    if (req.zoomPass) lines.push(`パスコード: ${req.zoomPass}`);
    lines.push("");
  } else if (req.place) {
    lines.push("【場所】", req.place, "");
  }
  if (req.note) lines.push(req.note, "");
  lines.push("よろしくお願いいたします！");
  return lines.join("\n");
}
function serialize(d) {
  const q = d.data();
  return {
    id: d.id,
    uid: q.uid,
    name: q.name || "",
    grad: q.grad || null,
    text: q.text || "",
    answer: q.answer || null,
    public: q.public === true,
    createdAt: q.createdAt?.toMillis ? q.createdAt.toMillis() : null,
    answeredAt: q.answeredAt?.toMillis ? q.answeredAt.toMillis() : null,
  };
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  const body = await readJson(req);
  const action = body.action;

  // ---- 面談の予約（学生） ----
  if (action === "bookInterview") {
    const user = await requireUser(req);
    if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });
    const id = String(body.id || "");
    const slotId = String(body.slotId || "");
    if (!id || !slotId) return sendJson(res, 400, { error: "面談と時間を指定してください。" });
    try {
      const ref = dbAdmin.collection("surveys").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return sendJson(res, 404, { error: "面談のご案内が見つかりません。" });
      const d = snap.data();
      if (d.interview !== true) return sendJson(res, 400, { error: "面談のご案内ではありません。" });
      if (Array.isArray(d.targetUids) && !d.targetUids.includes(user.uid)) {
        return sendJson(res, 403, { error: "この面談の対象ではありません。" });
      }
      const slot = (d.slots || []).find((s) => s.id === slotId);
      if (!slot) return sendJson(res, 400, { error: "選択できない時間です。" });
      // 先に他の方が押さえていないか確認（1枠1名）
      const bookings = d.bookings || {};
      const taken = Object.keys(bookings).some((u) => u !== user.uid && bookings[u] && bookings[u].slotId === slotId);
      if (taken) return sendJson(res, 409, { error: "申し訳ありません。その時間はちょうど埋まってしまいました。別の時間をお選びください。" });

      const sdoc = await dbAdmin.collection("students").doc(user.uid).get();
      const st = sdoc.exists ? sdoc.data() : {};
      await ref.update({
        [`bookings.${user.uid}`]: {
          slotId, date: slot.date, start: slot.start, end: slot.end,
          name: st.name || "", bookedAt: FieldValue.serverTimestamp(),
        },
      });

      let lineSent = false;
      if (st.lineUserId) {
        try { await pushMessage(st.lineUserId, bookingMessage(d, slot)); lineSent = true; }
        catch { /* LINE送信に失敗しても予約自体は成立させる */ }
      }
      return sendJson(res, 200, { ok: true, lineSent });
    } catch (err) {
      return sendJson(res, 500, { error: "予約に失敗しました。時間をおいてお試しください。" });
    }
  }

  // ---- 投稿（学生） ----
  if (action === "ask") {
    const user = await requireUser(req);
    if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });
    const t = String(body.text || "").trim();
    if (!t) return sendJson(res, 400, { error: "質問を入力してください。" });
    if (t.length > 1000) return sendJson(res, 400, { error: "質問が長すぎます（1000文字以内）。" });
    const sdoc = await dbAdmin.collection("students").doc(user.uid).get();
    const s = sdoc.exists ? sdoc.data() : {};
    await dbAdmin.collection("questions").add({
      uid: user.uid, name: s.name || "", grad: s.grad || null,
      text: t, answer: null, answeredAt: null, public: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return sendJson(res, 200, { ok: true });
  }

  // ---- 一覧 ----
  if (action === "list") {
    const user = await requireUser(req);
    if (!user) return sendJson(res, 401, { error: "ログインが必要です。" });
    const email = (user.email || "").toLowerCase();
    const isAdmin = user.admin === true || adminEmails().includes(email);
    const snap = await dbAdmin.collection("questions").get();
    const all = snap.docs.map(serialize).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (isAdmin) return sendJson(res, 200, { admin: true, all });
    const mine = all.filter((q) => q.uid === user.uid);
    const faq = all
      .filter((q) => q.public && q.answer)
      .map((q) => ({ id: q.id, text: q.text, answer: q.answer, answeredAt: q.answeredAt }));
    return sendJson(res, 200, { admin: false, mine, faq });
  }

  // ---- 回答／公開／削除（管理者） ----
  if (action === "answer") {
    const admin = await requireAdmin(req);
    if (!admin) return sendJson(res, 403, { error: "権限がありません。" });
    const { id, answer, isPublic, remove } = body;
    if (!id) return sendJson(res, 400, { error: "id が必要です。" });
    const ref = dbAdmin.collection("questions").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return sendJson(res, 404, { error: "質問が見つかりません。" });

    if (remove === true) {
      await ref.delete();
      return sendJson(res, 200, { ok: true, removed: true });
    }

    const prev = doc.data();
    const ans = String(answer || "").trim();
    const patch = { public: isPublic === true };
    let notify = false;
    if (ans) {
      patch.answer = ans;
      patch.answeredAt = FieldValue.serverTimestamp();
      patch.answeredBy = admin.email || null;
      if (!prev.answer) notify = true;
    }
    await ref.update(patch);

    let notified = false;
    if (notify && prev.uid) {
      try {
        const sdoc = await dbAdmin.collection("students").doc(prev.uid).get();
        const lineUserId = sdoc.exists ? sdoc.data().lineUserId : null;
        if (lineUserId) {
          await pushMessage(lineUserId, "ご質問への回答が届きました。マイページの「質問箱」からご確認ください。");
          notified = true;
        }
      } catch { /* 通知失敗は無視 */ }
    }
    return sendJson(res, 200, { ok: true, notified });
  }

  return sendJson(res, 400, { error: "不明なアクションです。" });
}
