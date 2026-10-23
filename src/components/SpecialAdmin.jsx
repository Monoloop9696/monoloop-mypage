import { useMemo, useState } from "react";
import { Download, Copy, Trash2, ExternalLink } from "lucide-react";
import { SectionTitle } from "./common";
import { BRAND, BRAND_LIGHT } from "../theme";
import { downloadCsv } from "../lib/csv";
import { setSpecialCode, updateTemplate, deleteTemplate } from "../lib/firestore";
import {
  SPECIAL_ROUTES, SPECIAL_STATUSES, specialRouteName, normalizeSpecialCode, isValidSpecialCode,
  specialCodeState, specialUrl,
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

  const countByCode = useMemo(() => {
    const m = {};
    entries.forEach((e) => { m[e.code] = (m[e.code] || 0) + 1; });
    return m;
  }, [entries]);

  const list = entries.filter((e) => {
    if (fRoute && e.route !== fRoute) return false;
    if (fStatus && (e.status || "未対応") !== fStatus) return false;
    if (fCode && e.code !== fCode) return false;
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

  const exportCsv = () => {
    const header = ["受付日時", "氏名", "フリガナ", "ルート", "大学", "学部・学科", "卒業年度", "メール", "電話", "コード", "経路メモ", "聞きたいこと", "対応状況", "対応メモ", "再エントリー回数"];
    const rows = list.map((e) => [
      fmt(e.createdAt), e.name, e.kana, specialRouteName(e.route), e.univ, e.faculty, e.grad ? `${e.grad}卒` : "",
      e.email, e.phone, e.code, e.codeLabel, e.question, e.status || "未対応", e.memo, e.resubmitCount || 0,
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
    </div>
  );
}
