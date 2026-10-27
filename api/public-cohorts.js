import { createHash } from "node:crypto";
import { dbAdmin, FieldValue } from "./_lib/firebaseAdmin.js";
import { readJson, sendJson, methodGuard, adminEmails, requireAdmin } from "./_lib/util.js";
import { sendEmail } from "./_lib/resend.js";
import { SLOT_KINDS, slotKindForRoute, formatSlotLabel, selectableSlots, validateSlotSelection } from "../src/lib/specialRoute.js";

// 公開エンドポイント（未ログインで呼べる）。Vercel の関数数上限（12）対策で action により分岐する。
//   action なし        : /signup での年度有効性チェック。initialPassword は絶対に返さない（year と active のみ）。
//   action=specialVerify: 特別選考LP（/special）の特別コード確認。コードの有無と状態だけ返す（媒体メモ等は返さない）。
//   action=specialSlots : 特別選考LPに出す説明会／OCの候補日程（受付中・今日以降）。{ kind } → { slots }
//   action=specialEntry : 特別選考LPのエントリー登録。templates に _type:"specialEntry" で保存し、本人と管理者へメール。
//   action=specialConfirm: 【管理者のみ】エントリーの日程を確定し、希望があれば本人へ確定メール。
// 特別コード・エントリー・日程は templates（管理者のみ read/write）に置くので Firestore ルールの変更は不要。
// 日程の判定ロジックは src/lib/specialRoute.js を LP・管理画面と共用する。

const APP_URL = process.env.APP_URL || "https://monoloop-mypage.vercel.app";

// src/lib/specialRoute.js の SPECIAL_ROUTES と id・名前・案内文を揃えること
const SPECIAL_ROUTES = {
  special1: { name: "特別選考ルート①", next: "3営業日以内に、説明会の日程についてメールでご連絡します。" },
  special2: { name: "特別選考ルート②", next: "3営業日以内に、オープンカンパニーの日程についてメールでご連絡します。" },
  casual: { name: "カジュアル面談ルート", next: "3営業日以内に、面談の日程についてメールでご連絡します。" },
};

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const normCode = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();
const clip = (s, n) => String(s || "").trim().slice(0, n);

// コードを確認して { ok, code, data } か { ok:false, reason } を返す
async function checkCode(raw) {
  const code = normCode(raw);
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) return { ok: false, reason: "not_found" };
  const snap = await dbAdmin.collection("templates").doc(`special_code_${code}`).get();
  if (!snap.exists || snap.data()._type !== "specialCode") return { ok: false, reason: "not_found" };
  const c = snap.data();
  if (c.active === false) return { ok: false, reason: "stopped" };
  if (c.expiresAt && c.expiresAt < todayJst()) return { ok: false, reason: "expired" };
  return { ok: true, code, data: c };
}

async function cohortsHandler(res) {
  const snap = await dbAdmin.collection("cohorts").get();
  const cohorts = snap.docs
    .map((d) => {
      const c = d.data();
      return { year: c.year, active: c.active === true };
    })
    .sort((a, b) => a.year - b.year);
  return sendJson(res, 200, { cohorts });
}

async function specialVerify(res, body) {
  const r = await checkCode(body.code);
  if (!r.ok) return sendJson(res, 200, { ok: false, reason: r.reason });
  return sendJson(res, 200, { ok: true, code: r.code });
}

// 日程（_type:"specialSlot"）を全件取得
async function loadSlots() {
  const snap = await dbAdmin.collection("templates").where("_type", "==", "specialSlot").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 学生に見せる候補日程。公開するキーは最小限（id, date, start, end, note, remaining）
async function specialSlots(res, body) {
  const kind = SLOT_KINDS[body.kind] ? body.kind : null;
  if (!kind) return sendJson(res, 200, { slots: [] });
  const slots = selectableSlots(await loadSlots(), { kind, today: todayJst() })
    .map((s) => ({ id: s.id, date: s.date, start: s.start || "", end: s.end || "", note: s.note || "", remaining: s.remaining ?? null }));
  return sendJson(res, 200, { slots });
}

// メール用：候補日程のブロック（候補も別日希望も無ければ空文字）
function slotBlockText(slotIds, otherDate, slots) {
  const byId = new Map(slots.map((s) => [s.id, s]));
  const lines = slotIds.map((id) => byId.get(id)).filter(Boolean).map((s) => `・${formatSlotLabel(s)}${s.note ? `（${s.note}）` : ""}`);
  if (otherDate) lines.push("・別日での調整を希望");
  if (!lines.length) return "";
  return `▼ ご希望の候補日程\n${lines.join("\n")}\n日程は人事からご連絡します。\n\n`;
}

async function specialEntry(res, body) {
  // ボット対策：画面に出さない入力欄（website）に値が入っていたら、保存せず成功扱いで返す
  if (body.website) return sendJson(res, 200, { ok: true });

  const r = await checkCode(body.code);
  if (!r.ok) return sendJson(res, 400, { error: "特別コードを確認できませんでした。もう一度コードを入力してください。", code: r.reason });

  const route = SPECIAL_ROUTES[body.route] ? body.route : null;
  const f = {
    name: clip(body.name, 40),
    kana: clip(body.kana, 60),
    univ: clip(body.univ, 60),
    faculty: clip(body.faculty, 60),
    grad: Number(body.grad) || null,
    email: clip(body.email, 120).toLowerCase(),
    phone: clip(body.phone, 20),
    question: clip(body.question, 400),
  };
  if (!route) return sendJson(res, 400, { error: "選考ルートを選んでください。" });
  if (!f.name || !f.kana || !f.univ) return sendJson(res, 400, { error: "必須項目が入力されていません。" });
  if (!/^[ァ-ヶー\s　]+$/.test(f.kana)) return sendJson(res, 400, { error: "フリガナは全角カタカナで入力してください。" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return sendJson(res, 400, { error: "メールアドレスの形式が正しくありません。" });
  if (f.phone && !/^\d{2,4}-\d{2,4}-\d{3,4}$/.test(f.phone)) return sendJson(res, 400, { error: "電話番号はハイフンつきで入力してください（例：090-1234-5678）。" });
  if (body.agree !== true) return sendJson(res, 400, { error: "個人情報の取り扱いへの同意が必要です。" });

  // 候補日程（①＝説明会／②＝OC のみ）。LP を開いたあとに停止・満員になった枠は黙って除外し、
  // 残り 0 件かつ別日希望なしならエラー。公開枠が無いときは設問を出していないので [] で受け付ける
  const kind = slotKindForRoute(route);
  const allSlots = kind ? await loadSlots() : [];
  const sel = validateSlotSelection({ routeId: route, slotIds: body.slotIds, otherDate: body.otherDate === true, slots: allSlots, today: todayJst() });
  if (!sel.ok) return sendJson(res, 400, { error: sel.error });
  const slotIds = sel.slotIds;
  const otherDate = kind ? body.otherDate === true : false;

  // 同じメールアドレスからの再エントリーは1件にまとめる（ルートや連絡先は最新に上書き、受付日時・対応状況は保持）
  const id = "special_entry_" + createHash("sha256").update(f.email).digest("hex").slice(0, 24);
  const ref = dbAdmin.collection("templates").doc(id);
  const prev = await ref.get();
  const payload = {
    _type: "specialEntry",
    ...f,
    route,
    code: r.code,
    codeLabel: r.data.label || "",
    slotIds,
    otherDate,
    agreedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const noConfirm = { confirmedSlotId: null, confirmedAt: null, confirmMailAt: null };
  if (prev.exists) {
    // 日程の種別が変わった（①⇄②、または casual になった）ら確定を解除。同じ種別なら保持
    const kindChanged = slotKindForRoute(prev.data().route) !== kind;
    await ref.set({ ...payload, ...(kindChanged ? noConfirm : {}), resubmitCount: (prev.data().resubmitCount || 0) + 1 }, { merge: true });
  } else {
    await ref.set({ ...payload, ...noConfirm, status: "未対応", memo: "", resubmitCount: 0, createdAt: FieldValue.serverTimestamp() });
  }
  const slotBlock = slotBlockText(slotIds, otherDate, allSlots);

  // メールは失敗してもエントリー自体は成功扱い
  const routeName = SPECIAL_ROUTES[route].name;
  const mails = [
    sendEmail({
      to: f.email,
      subject: "【モノ・ループ】特別選考ルートへのエントリーを受け付けました",
      text:
        `${f.name}さん\n\n` +
        `モノ・ループ株式会社 新卒採用です。\n` +
        `特別選考ルートへのエントリーを受け付けました。ありがとうございます。\n\n` +
        `選択したルート：${routeName}\n\n` +
        slotBlock +
        `${SPECIAL_ROUTES[route].next}\n` +
        `しばらく届かない場合は、迷惑メールフォルダもご確認ください。\n\n` +
        `※ お心当たりのない場合はこのメールを破棄してください。\n\n` +
        `モノ・ループ株式会社 採用担当`,
    }),
  ];
  const admins = adminEmails();
  if (admins.length) {
    mails.push(
      sendEmail({
        to: admins,
        subject: `【特別選考】${prev.exists ? "再エントリー" : "新しいエントリー"}：${f.name}さん（${routeName}）`,
        text:
          `特別選考LPから${prev.exists ? "再エントリー" : "エントリー"}がありました。\n\n` +
          `氏名：${f.name}（${f.kana}）\n大学：${f.univ}${f.faculty ? " " + f.faculty : ""}\n` +
          `ルート：${routeName}\nコード：${r.code}${r.data.label ? `（${r.data.label}）` : ""}\n\n` +
          slotBlock +
          `管理画面の「特別選考」タブで確認・対応してください。\n${APP_URL}/admin`,
      })
    );
  }
  const results = await Promise.allSettled(mails);
  results.forEach((x) => x.status === "rejected" && console.error("[special-entry] mail failed:", x.reason && x.reason.message));

  return sendJson(res, 200, { ok: true, mailSent: results[0].status === "fulfilled" });
}

// 【管理者のみ】日程の確定：{ entryId, slotId | null, sendMail }
//   slotId があれば確定（対応状況が未対応/連絡済なら「日程調整済」へ）、null なら未確定に戻す（メールは送らない）
async function specialConfirm(req, res, body) {
  const admin = await requireAdmin(req);
  if (!admin) return sendJson(res, 403, { error: "権限がありません。" });

  const entryId = String(body.entryId || "");
  const slotId = body.slotId ? String(body.slotId) : null;
  const sendMail = body.sendMail === true && !!slotId;

  const eRef = dbAdmin.collection("templates").doc(entryId);
  const eSnap = entryId ? await eRef.get() : null;
  if (!eSnap || !eSnap.exists || eSnap.data()._type !== "specialEntry") return sendJson(res, 404, { error: "エントリーが見つかりません。" });
  const entry = eSnap.data();

  let slot = null;
  if (slotId) {
    const sSnap = await dbAdmin.collection("templates").doc(slotId).get();
    if (!sSnap.exists || sSnap.data()._type !== "specialSlot") return sendJson(res, 404, { error: "日程が見つかりません。" });
    slot = { id: sSnap.id, ...sSnap.data() };
  }

  const patch = {
    confirmedSlotId: slotId,
    confirmedAt: slotId ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (slotId && ["未対応", "連絡済"].includes(entry.status || "未対応")) patch.status = "日程調整済";
  if (!slotId) patch.confirmMailAt = null;
  await eRef.set(patch, { merge: true });

  let mailSent = false;
  if (sendMail && slot) {
    const kindName = SLOT_KINDS[slot.kind] || "面談";
    const routeName = (SPECIAL_ROUTES[entry.route] || {}).name || "";
    try {
      await sendEmail({
        to: entry.email,
        subject: `【モノ・ループ】${kindName}の日程が確定しました`,
        text:
          `${entry.name || ""}さん\n\n` +
          `モノ・ループ株式会社 新卒採用です。\n` +
          `${kindName}の日程が確定しましたのでお知らせします。\n\n` +
          (routeName ? `選択したルート：${routeName}\n` : "") +
          `確定した日程：${formatSlotLabel(slot)}\n` +
          (slot.note ? `${slot.note}\n` : "") +
          `\n変更が必要な場合は、このメールに返信してください。\n\n` +
          `モノ・ループ株式会社 採用担当`,
      });
      mailSent = true;
      await eRef.set({ confirmMailAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error("[special-confirm] mail failed:", e && e.message);
    }
  }
  return sendJson(res, 200, { ok: true, mailSent });
}

export default async function handler(req, res) {
  if (!methodGuard(req, res)) return;
  try {
    const body = await readJson(req);
    if (body.action === "specialVerify") return await specialVerify(res, body);
    if (body.action === "specialSlots") return await specialSlots(res, body);
    if (body.action === "specialEntry") return await specialEntry(res, body);
    if (body.action === "specialConfirm") return await specialConfirm(req, res, body);
    return await cohortsHandler(res);
  } catch (err) {
    console.error("[public-cohorts] error:", err && err.message);
    return sendJson(res, 500, { error: "処理に失敗しました。時間をおいて再度お試しください。" });
  }
}
