import { useMemo, useState } from "react";
import { Download, Copy, Trash2, ExternalLink, X } from "lucide-react";
import { SectionTitle, TimeSelect } from "./common";
import { BRAND, BRAND_LIGHT } from "../theme";
import { downloadCsv } from "../lib/csv";
import { setSpecialCode, updateTemplate, deleteTemplate, addSpecialSlot } from "../lib/firestore";
import { specialConfirm } from "../lib/api";
import {
  SPECIAL_ROUTES, SPECIAL_STATUSES, specialRouteName, normalizeSpecialCode, isValidSpecialCode,
  specialCodeState, specialUrl, SLOT_KINDS, slotKindForRoute, formatSlotLabel, isSlotFull, todayJst,
} from "../lib/specialRoute";

// =====================================================================
// 管理画面「特別選考」タブ
//   スカウトで配布する特別コードの発行・停止、LP（/special）からのエントリーの一覧・対応状況・CSV、スカウト文面のコピー。
//   データは AdminApp が常時購読している templates（_type:"specialCode" / "specialEntry"）をそのまま使う。
// =====================================================================

const STATUS_STYLE = {
  未対応: { background: "#FFF7E6", color: "#B45309" },
  連絡済: { background: "#EEF2FF", color: "#4338CA" },
  日程調整済: { background: "#EEF2FF", color: "#4338CA" },
  選考中: { background: BRAND_LIGHT, color: BRAND },
  内定: { background: "#EAF7EE", color: "#1E874B" },
  辞退: { background: "#F3F4F6", color: "#6B7280" },
  見送り: { background: "#F3F4F6", color: "#6B7280" },
};
const CODE_STATE = {
  on: { label: "受付中", style: { background: "#EAF7EE", color: "#1E874B" } },
  exp: { label: "期限切れ", style: { background: "#FFF7E6", color: "#B45309" } },
  off: { label: "停止中", style: { background: "#F3F4F6", color: "#6B7280" } },
};

const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() : 0);
const fmt = (t) => {
  const ms = tsMs(t);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const scoutText = (code, exp) => `【特別コードを配布！】モノ・ループの特別選考ルートにご招待します

〇〇さん

はじめまして。モノ・ループ株式会社 新卒採用担当の〇〇です。
プロフィールを拝見し、ぜひ一度お話ししたいと思いご連絡しました。

スカウトをお送りした方限定で、書類選考なしで進める「特別な入口」をご用意しています。
「すぐに選考へ進む」「まずは社員と話してみる」など、ご自身に合うルートを選んでエントリーできます。

▼特別選考ルート エントリーページ
${specialUrl(code)}

▼あなたの特別コード
${code}

有効期限：${exp ? exp.replace(/-/g, "/") : "〇月〇日"}

お会いできるのを楽しみにしています。`;

export default function SpecialAdmin({ savedTemplates, pc, setBanner }) {
  const codes = useMemo(
    () => savedTemplates.filter((t) => t._type === "specialCode").sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)),
    [savedTemplates]
  );
  const entries = useMemo(
    () => savedTemplates.filter((t) => t._type === "specialEntry").sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)),
    [savedTemplates]
  );

  const [fRoute, setFRoute] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCode, setFCode] = useState("");
  const [q, setQ] = useState("");
  const [nc, setNc] = useState({ code: "", label: "", expiresAt: "" });
  const [codeErr, setCodeErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // 削除確認中のドキュメントid
  const [openMemo, setOpenMemo] = useState(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [scoutCode, setScoutCode] = useState("");
  const [copied, setCopied] = useState("");
  // 説明会／OCの日程
  const slots = useMemo(
    () => savedTemplates.filter((t) => t._type === "specialSlot").sort((a, b) => ((a.date || "") + (a.start || "")).localeCompare((b.date || "") + (b.start || ""))),
    [savedTemplates]
  );
  const [ns, setNs] = useState({ kind: "seminar", date: "", start: "", end: "", note: "", remaining: "" });
  const [slotErr, setSlotErr] = useState("");
  const [fSlot, setFSlot] = useState("");
  const [confirmDlg, setConfirmDlg] = useState(null); // { entry, slotId, sendMail } 日程確定の確認
  const [confirmBusy, setConfirmBusy] = useState(false);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  // 日程ごとの希望数・確定数
  const slotCounts = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      (e.slotIds || []).forEach((id) => { m[id] = m[id] || { wish: 0, fixed: 0 }; m[id].wish += 1; });
      if (e.confirmedSlotId) { m[e.confirmedSlotId] = m[e.confirmedSlotId] || { wish: 0, fixed: 0 }; m[e.confirmedSlotId].fixed += 1; }
    });
    return m;
  }, [entries]);
  const today = todayJst();
  const slotLabelOf = (id) => {
    const s = slotById.get(id);
    if (!s) return "（削除済みの枠）";
    return formatSlotLabel(s) + (s.active === false ? "（停止中）" : "");
  };

  const countByCode = useMemo(() => {
    const m = {};
    entries.forEach((e) => { m[e.code] = (m[e.code] || 0) + 1; });
    return m;
  }, [entries]);

  const list = entries.filter((e) => {
    if (fRoute && e.route !== fRoute) return false;
    if (fStatus && (e.status || "未対応") !== fStatus) return false;
    if (fCode && e.code !== fCode) return false;
    if (fSlot && !((e.slotIds || []).includes(fSlot) || e.confirmedSlotId === fSlot)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = [e.name, e.kana, e.univ, e.faculty, e.email, e.phone].join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const activeCodes = codes.filter((c) => specialCodeState(c) === "on");
  const scoutTarget = codes.find((c) => c.code === scoutCode) || activeCodes[0] || null;

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); }
    catch { setBanner("コピーできませんでした。テキストを選択してコピーしてください。"); }
  };

  const addCode = async (e) => {
    e.preventDefault();
    setCodeErr("");
    const code = normalizeSpecialCode(nc.code);
    if (!isValidSpecialCode(code)) return setCodeErr("コードは英数字とハイフンで3〜20文字にしてください。");
    if (codes.some((c) => c.code === code)) return setCodeErr("同じコードがすでにあります。別のコードにしてください。");
    setBusy(true);
    try {
      await setSpecialCode(code, { label: nc.label.trim(), expiresAt: nc.expiresAt });
      setNc({ code: "", label: "", expiresAt: "" });
      setScoutCode(code);
    } catch (ex) { setBanner(`コードの発行に失敗しました：${ex.message}`); }
    finally { setBusy(false); }
  };

  const safe = async (fn, msg) => {
    try { await fn(); } catch (ex) { setBanner(`${msg}：${ex.message}`); }
  };

  const addSlot = async (e) => {
    e.preventDefault();
    setSlotErr("");
    if (!ns.date || !ns.start) return setSlotErr("日付と開始時刻を入力してください。");
    if (ns.end && ns.end <= ns.start) return setSlotErr("終了時刻は開始時刻より後にしてください。");
    setBusy(true);
    try {
      await addSpecialSlot({ kind: ns.kind, date: ns.date, start: ns.start, end: ns.end, note: ns.note.trim(), remaining: ns.remaining === "" ? null : Number(ns.remaining) });
      setNs((p) => ({ ...p, start: "", end: "", note: "", remaining: "" }));
    } catch (ex) { setBanner(`日程の追加に失敗しました：${ex.message}`); }
    finally { setBusy(false); }
  };

  // 日程の確定（確認ダイアログ → API）。slotId=null は未確定に戻す
  const runConfirm = async () => {
    if (!confirmDlg) return;
    setConfirmBusy(true);
    try {
      const r = await specialConfirm({ entryId: confirmDlg.entry.id, slotId: confirmDlg.slotId, sendMail: confirmDlg.sendMail });
      if (confirmDlg.slotId && confirmDlg.sendMail && r.mailSent === false) setBanner("日程は確定しましたが、案内メールを送れませんでした。");
      setConfirmDlg(null);
    } catch (ex) { setBanner(`日程の確定に失敗しました：${ex.message}`); }
    finally { setConfirmBusy(false); }
  };

  // 確定プルダウンの選択肢：そのルートの種別の受付中・今日以降の枠 ＋ 候補に印のある枠 ＋ すでに確定している枠
  const confirmOptions = (e) => {
    const kind = slotKindForRoute(e.route);
    const wish = new Set(e.slotIds || []);
    return slots
      .filter((s) => (s.kind === kind && s.active !== false && (s.date || "") >= today) || wish.has(s.id) || s.id === e.confirmedSlotId)
      .sort((a, b) => (wish.has(b.id) ? 1 : 0) - (wish.has(a.id) ? 1 : 0))
      .map((s) => ({ id: s.id, label: `${formatSlotLabel(s)}${wish.has(s.id) ? "（希望）" : ""}${s.active === false ? "（停止中）" : ""}` }));
  };

  const exportCsv = () => {
    const header = ["受付日時", "氏名", "フリガナ", "ルート", "大学", "学部・学科", "卒業年度", "メール", "電話", "コード", "経路メモ", "聞きたいこと", "候補日程", "別日希望", "確定日程", "対応状況", "対応メモ", "再エントリー回数"];
    const rows = list.map((e) => [
      fmt(e.createdAt), e.name, e.kana, specialRouteName(e.route), e.univ, e.faculty, e.grad ? `${e.grad}卒` : "",
      e.email, e.phone, e.code, e.codeLabel, e.question,
      (e.slotIds || []).map(slotLabelOf).join("、"), e.otherDate ? "希望" : "", e.confirmedSlotId ? slotLabelOf(e.confirmedSlotId) : "",
      e.status || "未対応", e.memo, e.resubmitCount || 0,
    ]);
    downloadCsv(`特別選考エントリー_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const sel = "border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white";
  const card = "bg-white border border-gray-200 rounded-xl p-4";

  return (
    <div className={pc ? "space-y-5 pt-5" : "px-4 pt-4 space-y-5"}>
      {/* 集計 */}
      <div className={pc ? "grid grid-cols-5 gap-2" : "grid grid-cols-3 gap-1.5"}>
        {[
          ["エントリー", entries.length],
          ["未対応", entries.filter((e) => (e.status || "未対応") === "未対応").length],
          ...SPECIAL_ROUTES.map((r) => [r.name.replace("ルート", ""), entries.filter((e) => e.route === r.id).length]),
        ].map(([k, v]) => (
          <div key={k} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-gray-500 truncate">{k}</p>
            <p className="text-xl font-bold tabular-nums" style={k === "未対応" && v > 0 ? { color: "#B45309" } : {}}>{v}</p>
          </div>
        ))}
      </div>

      <div className={pc ? "grid grid-cols-[1.6fr_1fr] gap-5 items-start" : "space-y-5"}>
        {/* エントリー一覧 */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <SectionTitle>特別選考エントリー</SectionTitle>
            <button onClick={exportCsv} disabled={!list.length}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 mb-3 disabled:opacity-40">
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名・大学・メールで検索"
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white flex-1 min-w-[140px]" />
            <select value={fRoute} onChange={(e) => setFRoute(e.target.value)} className={sel} aria-label="ルートで絞り込む">
              <option value="">全ルート</option>
              {SPECIAL_ROUTES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel} aria-label="対応状況で絞り込む">
              <option value="">全状況</option>
              {SPECIAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={fCode} onChange={(e) => setFCode(e.target.value)} className={sel} aria-label="コードで絞り込む">
              <option value="">全コード</option>
              {codes.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
            </select>
            {slots.length > 0 && (
              <select value={fSlot} onChange={(e) => setFSlot(e.target.value)} className={sel} aria-label="日程で絞り込む">
                <option value="">全日程</option>
                {slots.map((s) => <option key={s.id} value={s.id}>{SLOT_KINDS[s.kind] || ""} {formatSlotLabel(s)}</option>)}
              </select>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center">
              まだエントリーはありません。右の「特別コード」でコードを発行し、スカウト文面に貼って送ってください。
            </p>
          ) : list.length === 0 ? (
            <p className="text-xs text-gray-400">条件に合うエントリーはありません。</p>
          ) : (
            <div className={pc ? "grid grid-cols-2 gap-3" : "space-y-3"}>
              {list.map((e) => {
                const st = e.status || "未対応";
                return (
                  <div key={e.id} className={`${card} space-y-2 min-w-0`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{e.name}<span className="text-xs text-gray-400 font-normal ml-1.5">{e.kana}</span></p>
                        <p className="text-xs text-gray-500 truncate">{e.univ}{e.faculty ? `・${e.faculty}` : ""}{e.grad ? `・${e.grad}卒` : ""}</p>
                      </div>
                      <select value={st} onChange={(ev) => safe(() => updateTemplate(e.id, { status: ev.target.value }), "対応状況の更新に失敗しました")}
                        className="text-xs font-bold rounded-full px-2 py-1 border-0 shrink-0" style={STATUS_STYLE[st] || {}}
                        aria-label={`${e.name}さんの対応状況`}>
                        {SPECIAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: BRAND_LIGHT, color: BRAND }}>{specialRouteName(e.route)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">{e.code}</span>
                      {e.codeLabel && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{e.codeLabel}</span>}
                      {e.resubmitCount > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: "#FFF7E6", color: "#B45309" }}>再エントリー{e.resubmitCount}回</span>}
                    </div>
                    {(slotKindForRoute(e.route) || e.otherDate || e.confirmedSlotId) && (() => {
                      const kind = slotKindForRoute(e.route);
                      const opts = confirmOptions(e);
                      const fixed = e.confirmedSlotId ? slotById.get(e.confirmedSlotId) : null;
                      return (
                        <div className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ background: "#F9FAFB" }}>
                          <p className="text-[11px] text-gray-400">{kind ? `${SLOT_KINDS[kind]}の候補日程` : "候補日程"}</p>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {(e.slotIds || []).map((id) => (
                              <span key={id} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">{slotLabelOf(id)}</span>
                            ))}
                            {e.otherDate && <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: "#FFF7E6", color: "#B45309" }}>別日で調整を希望</span>}
                            {!(e.slotIds || []).length && !e.otherDate && <span className="text-gray-400">候補なし（公開中の日程がありませんでした）</span>}
                          </div>
                          {e.confirmedSlotId && (
                            <p className="text-[11px] font-bold flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full" style={{ background: "#EAF7EE", color: "#1E874B" }}>
                                確定 {fixed ? formatSlotLabel(fixed) : "（削除済みの枠）"}{fixed && fixed.active === false ? "（停止中）" : ""}
                              </span>
                              {e.confirmMailAt && <span className="text-gray-400 font-normal">案内メール送信済 {fmt(e.confirmMailAt)}</span>}
                            </p>
                          )}
                          <label className="flex items-center gap-2 text-[11px] text-gray-500">
                            確定する日程
                            <select value={e.confirmedSlotId || ""} className={`${sel} flex-1 min-w-0`}
                              onChange={(ev) => setConfirmDlg({ entry: e, slotId: ev.target.value || null, sendMail: !!ev.target.value })}>
                              <option value="">未確定</option>
                              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          </label>
                        </div>
                      );
                    })()}
                    <div className="text-xs text-gray-600 space-y-0.5 break-all">
                      <p>✉ <span className="select-all">{e.email}</span></p>
                      {e.phone && <p>☎ <span className="select-all">{e.phone}</span></p>}
                      <p className="text-gray-400">受付 {fmt(e.createdAt)}{e.resubmitCount > 0 ? `／最終更新 ${fmt(e.updatedAt)}` : ""}</p>
                    </div>
                    {e.question && (
                      <p className="text-xs rounded-lg px-2.5 py-2 whitespace-pre-wrap" style={{ background: "#F9FAFB" }}>
                        <span className="text-gray-400">聞きたいこと：</span>{e.question}
                      </p>
                    )}
                    {openMemo === e.id ? (
                      <div className="space-y-1.5">
                        <textarea value={memoDraft} onChange={(ev) => setMemoDraft(ev.target.value)} rows={3}
                          placeholder="対応メモ（学生には見えません）" className="w-full border border-gray-300 rounded-lg p-2 text-xs" />
                        <div className="flex gap-2">
                          <button onClick={() => safe(async () => { await updateTemplate(e.id, { memo: memoDraft }); setOpenMemo(null); }, "メモの保存に失敗しました")}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>保存</button>
                          <button onClick={() => setOpenMemo(null)} className="text-xs text-gray-400">取消</button>
                        </div>
                      </div>
                    ) : e.memo ? (
                      <button onClick={() => { setOpenMemo(e.id); setMemoDraft(e.memo || ""); }}
                        className="block w-full text-left text-xs rounded-lg px-2.5 py-2 whitespace-pre-wrap" style={{ background: "#FFFBEB" }}>
                        <span className="text-gray-400">メモ：</span>{e.memo}
                      </button>
                    ) : null}
                    <div className="flex items-center gap-3 pt-1">
                      {openMemo !== e.id && !e.memo && (
                        <button onClick={() => { setOpenMemo(e.id); setMemoDraft(""); }} className="text-xs font-bold" style={{ color: BRAND }}>＋メモ</button>
                      )}
                      {confirmDel === e.id ? (
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-gray-500">削除しますか？</span>
                          <button onClick={() => { setConfirmDel(null); safe(() => deleteTemplate(e.id), "削除に失敗しました"); }}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg text-white" style={{ background: "#DC2626" }}>削除する</button>
                          <button onClick={() => setConfirmDel(null)} className="text-xs text-gray-400">取消</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDel(e.id)} className="ml-auto text-gray-300 hover:text-gray-500" aria-label="エントリーを削除">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 特別コード／スカウト文面 */}
        <div className="space-y-5 min-w-0">
          <div className="space-y-3">
            <SectionTitle>特別コード</SectionTitle>
            <p className="text-xs text-gray-500">媒体・送信回ごとにコードを分けると、どのスカウトから反応があったかを比べられます。</p>
            <form onSubmit={addCode} className={`${card} space-y-2.5`} noValidate>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label htmlFor="sc-code" className="text-xs font-bold text-gray-500">コード</label>
                  <input id="sc-code" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value.toUpperCase() })}
                    placeholder="OB-1101" className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm font-mono min-w-0" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="sc-exp" className="text-xs font-bold text-gray-500">有効期限（任意）</label>
                  <input id="sc-exp" type="date" value={nc.expiresAt} onChange={(e) => setNc({ ...nc, expiresAt: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm min-w-0" style={{ maxWidth: "100%" }} />
                </div>
              </div>
              <div>
                <label htmlFor="sc-label" className="text-xs font-bold text-gray-500">経路メモ（媒体・送信回）</label>
                <input id="sc-label" value={nc.label} onChange={(e) => setNc({ ...nc, label: e.target.value })}
                  placeholder="OfferBox 11月第1回" className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm" />
              </div>
              {codeErr && <p className="text-xs" style={{ color: "#B91C1C" }}>{codeErr}</p>}
              <button type="submit" disabled={busy} className="w-full text-sm font-bold py-2 rounded-lg text-white disabled:opacity-50" style={{ background: BRAND }}>
                {busy ? "発行中…" : "コードを発行"}
              </button>
            </form>

            {codes.length === 0 ? (
              <p className="text-xs text-gray-400">まだコードはありません。</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {codes.map((c) => {
                  const s = CODE_STATE[specialCodeState(c)];
                  const n = countByCode[c.code] || 0;
                  return (
                    <div key={c.id} className="px-3.5 py-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{c.code}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={s.style}>{s.label}</span>
                        <span className="ml-auto text-xs text-gray-500 tabular-nums">{n}件</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{c.label || "（経路メモなし）"}・期限 {c.expiresAt ? c.expiresAt.replace(/-/g, "/") : "なし"}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                        <button onClick={() => copy(specialUrl(c.code), `url-${c.code}`)} className="flex items-center gap-1" style={{ color: BRAND }}>
                          <Copy size={12} /> {copied === `url-${c.code}` ? "コピーしました" : "URLをコピー"}
                        </button>
                        <a href={specialUrl(c.code)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-gray-500">
                          <ExternalLink size={12} /> LPを開く
                        </a>
                        <button onClick={() => safe(() => updateTemplate(c.id, { active: c.active === false }), "コードの更新に失敗しました")} className="text-gray-500">
                          {c.active === false ? "再開する" : "停止する"}
                        </button>
                        {confirmDel === c.id ? (
                          <span className="ml-auto flex items-center gap-2">
                            <button onClick={() => { setConfirmDel(null); safe(() => deleteTemplate(c.id), "削除に失敗しました"); }}
                              className="px-2 py-0.5 rounded text-white" style={{ background: "#DC2626" }}>削除する</button>
                            <button onClick={() => setConfirmDel(null)} className="text-gray-400 font-normal">取消</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDel(c.id)} className="ml-auto text-gray-300 font-normal" title={n ? "エントリーは残ります" : undefined}>削除</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 説明会・OCの日程 */}
          <div className="space-y-3">
            <SectionTitle>説明会・オープンカンパニーの日程</SectionTitle>
            <p className="text-xs text-gray-500">ここに登録した日程が、LP でルート①（説明会）／②（OC）を選んだ学生に候補として表示されます。残り人数は自動では減りません。確定したら手で減らしてください（0 で「満員」になり選べなくなります）。</p>
            <form onSubmit={addSlot} className={`${card} space-y-2.5`} noValidate>
              <div className={pc ? "grid grid-cols-2 gap-2" : "space-y-2"}>
                <div className="min-w-0">
                  <label htmlFor="ss-kind" className="text-xs font-bold text-gray-500">種別</label>
                  <select id="ss-kind" value={ns.kind} onChange={(e) => setNs({ ...ns, kind: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                    {Object.entries(SLOT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="ss-date" className="text-xs font-bold text-gray-500">日付</label>
                  <input id="ss-date" type="date" value={ns.date} onChange={(e) => setNs({ ...ns, date: e.target.value })}
                    className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" style={{ maxWidth: "100%" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-500">開始</p>
                  <TimeSelect value={ns.start} onChange={(v) => setNs({ ...ns, start: v })} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-500">終了（任意）</p>
                  <TimeSelect value={ns.end} onChange={(v) => setNs({ ...ns, end: v })} min={ns.start || undefined} />
                </div>
                <div className="min-w-0">
                  <label htmlFor="ss-rem" className="text-xs font-bold text-gray-500">残り人数（空欄＝人数を出さない）</label>
                  <input id="ss-rem" type="number" min={0} value={ns.remaining} onChange={(e) => setNs({ ...ns, remaining: e.target.value })}
                    placeholder="例：10" className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="ss-note" className="text-xs font-bold text-gray-500">補足（任意）</label>
                  <input id="ss-note" value={ns.note} onChange={(e) => setNs({ ...ns, note: e.target.value })}
                    placeholder="オンライン（Zoom）" className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm" />
                </div>
              </div>
              {slotErr && <p className="text-xs" style={{ color: "#B91C1C" }}>{slotErr}</p>}
              <button type="submit" disabled={busy} className="w-full text-sm font-bold py-2 rounded-lg text-white disabled:opacity-50" style={{ background: BRAND }}>
                {busy ? "追加中…" : "日程を追加"}
              </button>
            </form>

            {slots.length === 0 ? (
              <p className="text-xs text-gray-400">まだ日程はありません。</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {[...slots.filter((s) => (s.date || "") >= today), ...slots.filter((s) => (s.date || "") < today)].map((s) => {
                  const past = (s.date || "") < today;
                  const c = slotCounts[s.id] || { wish: 0, fixed: 0 };
                  const full = isSlotFull(s);
                  return (
                    <div key={s.id} className="px-3.5 py-3 space-y-1.5" style={past ? { opacity: 0.55 } : {}}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: BRAND_LIGHT, color: BRAND }}>{SLOT_KINDS[s.kind] || s.kind}</span>
                        <span className="font-bold text-sm">{formatSlotLabel(s)}</span>
                        {s.active === false && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">停止中</span>}
                        {past && <span className="text-[11px] text-gray-400">終了</span>}
                        <span className="ml-auto text-xs text-gray-500 tabular-nums">希望{c.wish}名・確定{c.fixed}名</span>
                      </div>
                      {s.note && <p className="text-xs text-gray-500 truncate">{s.note}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 text-gray-500">
                          残り
                          <input type="number" min={0} step={1} key={`${s.id}:${s.remaining ?? ""}`} defaultValue={s.remaining ?? ""} placeholder="—"
                            onBlur={(ev) => {
                              const v = ev.target.value.trim();
                              const n = v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)); // 0以上の整数に丸める
                              if (n !== (s.remaining ?? null)) safe(() => updateTemplate(s.id, { remaining: n }), "残り人数の更新に失敗しました");
                              else ev.target.value = n === null ? "" : String(n);
                            }}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs text-right" aria-label="残り人数" />
                          名
                          {full && <span className="font-bold" style={{ color: "#DC2626" }}>満員</span>}
                        </label>
                        <button onClick={() => safe(() => updateTemplate(s.id, { active: s.active === false }), "日程の更新に失敗しました")} className="font-bold text-gray-500">
                          {s.active === false ? "再開する" : "停止する"}
                        </button>
                        {confirmDel === s.id ? (
                          <span className="ml-auto flex items-center gap-2">
                            {c.wish > 0 && <span className="text-gray-500">{c.wish}件のエントリーが候補にしています。</span>}
                            <button onClick={() => { setConfirmDel(null); safe(() => deleteTemplate(s.id), "削除に失敗しました"); }}
                              className="px-2 py-0.5 rounded text-white font-bold" style={{ background: "#DC2626" }}>削除する</button>
                            <button onClick={() => setConfirmDel(null)} className="text-gray-400">取消</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDel(s.id)} className="ml-auto text-gray-300">削除</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionTitle>スカウト文面の例</SectionTitle>
            {activeCodes.length === 0 ? (
              <p className="text-xs text-gray-400">受付中のコードを発行すると、そのコードとURLを入れた文面がここに出ます。</p>
            ) : (
              <div className={`${card} space-y-2.5`}>
                <div className="flex items-center gap-2">
                  <select value={scoutTarget?.code || ""} onChange={(e) => setScoutCode(e.target.value)} className={`${sel} flex-1 min-w-0`} aria-label="文面に入れるコード">
                    {activeCodes.map((c) => <option key={c.id} value={c.code}>{c.code}{c.label ? `（${c.label}）` : ""}</option>)}
                  </select>
                  <button onClick={() => copy(scoutText(scoutTarget.code, scoutTarget.expiresAt), "scout")}
                    className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-white shrink-0" style={{ background: BRAND }}>
                    <Copy size={12} /> {copied === "scout" ? "コピーしました" : "文面をコピー"}
                  </button>
                </div>
                <pre className="text-xs whitespace-pre-wrap rounded-lg p-3 bg-gray-50 border border-gray-100" style={{ fontFamily: "inherit" }}>
                  {scoutText(scoutTarget.code, scoutTarget.expiresAt)}
                </pre>
                <p className="text-[11px] text-gray-400">「〇〇」は送信前に書き換えてください。URLを開くとコード欄が入力済みの状態でLPが開きます。</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 日程確定の確認ダイアログ */}
      {confirmDlg && (() => {
        const s = confirmDlg.slotId ? slotById.get(confirmDlg.slotId) : null;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-40 px-6" onClick={() => !confirmBusy && setConfirmDlg(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-gray-100">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{confirmDlg.slotId ? "日程の確定" : "確定の取り消し"}</p>
                  <p className="text-lg font-bold mt-0.5 truncate">{confirmDlg.entry.name}</p>
                </div>
                <button onClick={() => setConfirmDlg(null)} aria-label="閉じる" className="shrink-0 -mt-0.5 -mr-1 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
              </div>
              <div className="p-5 pt-3 space-y-3 text-sm">
                {confirmDlg.slotId ? (
                  <>
                    <p><span className="text-xs text-gray-500 mr-2">日程</span><span className="font-bold">{s ? `${SLOT_KINDS[s.kind] || ""} ${formatSlotLabel(s)}` : "（不明な枠）"}</span></p>
                    {s && s.note && <p className="text-xs text-gray-500">{s.note}</p>}
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={confirmDlg.sendMail} onChange={(e) => setConfirmDlg({ ...confirmDlg, sendMail: e.target.checked })} className="mt-1" />
                      <span>確定後に学生へメールで案内を送る<span className="block text-xs text-gray-400">{confirmDlg.entry.email}</span></span>
                    </label>
                    <p className="text-[11px] text-gray-400">対応状況が「未対応」「連絡済」の場合は「日程調整済」に進みます。残り人数は自動では減りません。</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">この学生の確定日程を「未確定」に戻します。メールは送られません。</p>
                )}
              </div>
              <div className="p-3 pt-0 flex gap-2">
                <button onClick={runConfirm} disabled={confirmBusy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: BRAND }}>
                  {confirmBusy ? "処理中…" : confirmDlg.slotId ? "確定する" : "未確定に戻す"}
                </button>
                <button onClick={() => setConfirmDlg(null)} disabled={confirmBusy} className="px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-600">取消</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
