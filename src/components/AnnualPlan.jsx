import { useEffect, useMemo, useRef, useState } from "react";
import { X, Copy, Plus } from "lucide-react";
import { SectionTitle } from "./common";
import { BRAND, BRAND_LIGHT } from "../theme";
import { useBodyScrollLock } from "../lib/scrollLock";
import { addPlanItem, addPlanItems, touchPlanItem, deleteTemplate } from "../lib/firestore";
import {
  PLAN_MONTHS, PLAN_KINDS, PLAN_STATUS, ymd, cycleMonths, posInCycle, inCycle, layoutRows, shiftYear, planYears, defaultPlanDate,
  monthEnd, resolvePeriod, periodMode,
} from "../lib/annualPlan";

// =====================================================================
// 管理画面「年間計画」タブ
//   卒年度ごとの年表（卒業の2年前の8月〜卒業年の3月、20か月）に、人事が置く活動カード（予定／実施済み／中止）と
//   システム内の記録（イベント・アンケート・記事・LINE配信・面談・説明会/OC日程）を並べる。
//   カードは templates に _type:"planItem" で保存（AdminApp が常時購読している savedTemplates から拾う）。
//   PC は横スクロールの年表、スマホは月ごとの縦リスト（切替は pc prop）。
// =====================================================================

const COL = 88; // 1か月の列幅(px)
const LABEL_W = 150; // 左のレーン名列の幅(px)
const ROW_H = 30; // カード1行の高さ
const CARD_H = 26;
const TODAY_BG = "#FFF3E0";
const TODAY_FG = "#B45309";
const AUTO = { color: "#6B7280", bg: "#F3F4F6", border: "#E5E7EB" };
const HAIR = "#E5E7EB";

const tsToYmd = (t) => {
  const ms = t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() : 0;
  return ms ? ymd(new Date(ms)) : "";
};
const mdLabel = (dateStr) => {
  const [, m, d] = String(dateStr || "").split("-").map(Number);
  return m && d ? `${m}/${d}` : "";
};
const monthLabel = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  return y && m ? `${y}年${m}月` : "";
};
// 1日〜末日で入っている活動は「10月」「10月〜12月」と月で見せる
const rangeLabel = (a, b) => {
  const { sameDay, byMonth } = periodMode(a, b);
  if (byMonth) {
    const m1 = Number(String(a).slice(5, 7));
    const m2 = Number(String(b).slice(5, 7));
    return sameDay ? `${m1}月` : `${m1}月〜${m2}月`;
  }
  return a === b || !b ? mdLabel(a) : `${mdLabel(a)}〜${mdLabel(b)}`;
};
// 「月で入力」の選択肢: その年度の20か月。今の値が期間外ならそれも足す
const monthOptions = (grad, ...yms) => {
  const list = cycleMonths(grad).map((m) => ({ key: m.key, label: `${m.y}年${m.m}月` }));
  yms.forEach((ym) => { if (ym && !list.some((o) => o.key === ym)) list.push({ key: ym, label: monthLabel(ym) }); });
  return list.sort((x, y) => x.key.localeCompare(y.key));
};

// 自動レーンの定義（元データ → {id, title, start, end}）。grad は表示中の年度。
const AUTO_LANES = [
  {
    key: "events", label: "イベント", tab: "dash",
    pick: ({ events, grad }) => events
      .filter((e) => e.published !== false && Number(e.grad) === grad && e.dateStr)
      .map((e) => ({ id: `ev:${e.id}`, title: e.title || "イベント", start: e.dateStr, end: e.dateStr })),
  },
  {
    key: "surveys", label: "アンケート", tab: "dash",
    pick: ({ surveys, grad }) => surveys
      .filter((s) => s.published !== false && s.interview !== true && Number(s.grad) === grad)
      .map((s) => {
        const d = s.dueDate || tsToYmd(s.createdAt);
        return { id: `sv:${s.id}`, title: s.pulse ? `パルス調査：${s.title || ""}` : s.title || "アンケート", start: d, end: d };
      }),
  },
  {
    key: "articles", label: "記事", tab: "news",
    pick: ({ articles, grad }) => articles
      .filter((a) => a.published !== false && (a.grad == null || Number(a.grad) === grad))
      .map((a) => {
        const d = tsToYmd(a.publishAt) || tsToYmd(a.createdAt);
        return { id: `ar:${a.id}`, title: a.title || "記事", start: d, end: d };
      }),
  },
  {
    key: "broadcasts", label: "LINE配信", tab: "line",
    pick: ({ broadcasts, grad }) => broadcasts
      .filter((b) => Number(b.grad) === grad && b.sentAt)
      .map((b) => {
        const d = tsToYmd(b.sentAt);
        return { id: `bc:${b.id}`, title: b.target || "配信", start: d, end: d };
      }),
  },
  {
    key: "meetings", label: "面談", tab: "meet", monthly: true,
    pick: ({ savedTemplates, grad }) => savedTemplates
      .filter((t) => t._type === "meeting" && Number(t.grad || grad) === grad && t.date)
      .map((t) => ({ id: `mt:${t.id}`, title: "面談", start: t.date, end: t.date })),
  },
  {
    key: "slots", label: "説明会・OC日程", tab: "special",
    pick: ({ savedTemplates }) => savedTemplates
      .filter((t) => t._type === "specialSlot" && t.date)
      .map((t) => ({ id: `sl:${t.id}`, title: `${t.kind === "oc" ? "OC" : "説明会"}${t.start ? ` ${t.start}` : ""}`, start: t.date, end: t.date })),
  },
];

// 月ごとの件数にまとめる（面談レーン用）
const monthlyCounts = (rows, grad) => {
  const map = new Map();
  rows.forEach((r) => {
    const key = String(r.start).slice(0, 7);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return cycleMonths(grad)
    .filter((m) => map.has(m.key))
    .map((m) => ({ id: `cnt:${m.key}`, title: `${map.get(m.key)}件`, start: m.first, end: m.first, count: true }));
};

// 既定日は今日。ただし今日がその年度の期間外（例: 次の年度）なら期間の初日にし、年表に出ないカードを作らせない
const emptyItem = (grad, todayStr) => {
  const t = defaultPlanDate(grad, todayStr);
  return { grad, kind: "other", title: "", start: t, end: t, status: "plan", owner: "", memo: "", sameDay: true, byMonth: false };
};

export default function AnnualPlan({
  savedTemplates = [], events = [], surveys = [], articles = [], broadcasts = [], cohorts = [],
  pc, setBanner, setTab, selectedYear, selectYear,
}) {
  const items = useMemo(() => savedTemplates.filter((t) => t._type === "planItem"), [savedTemplates]);
  const years = useMemo(() => planYears({ cohorts, items }), [cohorts, items]);
  const [year, setYear] = useState(() => (years.includes(Number(selectedYear)) ? Number(selectedYear) : years[0]));
  const [overlay, setOverlay] = useState(true);
  const [showAuto, setShowAuto] = useState(true);
  const [kindOff, setKindOff] = useState(() => new Set());
  const [drawer, setDrawer] = useState(null); // { item, confirmDel }  新規は item.id 無し
  const [copyDlg, setCopyDlg] = useState(null); // { from, to, count }
  const [busy, setBusy] = useState(false);
  const [drawerErr, setDrawerErr] = useState(""); // ドロワー内に出す入力/保存エラー（共通バナーはドロワーの裏に隠れるため）
  const [copyErr, setCopyErr] = useState("");
  const [outsideOpen, setOutsideOpen] = useState(null); // 「期間外 N件」の一覧を開いている年度
  const [moreDlg, setMoreDlg] = useState(null); // 年表の「他N件」を押したときの一覧 { grad, lane, auto, month, items }
  const scrollRefs = useRef({}); // 年度ごとの横スクロール要素。前年度ボードと位置を揃える

  useBodyScrollLock(!!drawer || !!copyDlg || !!moreDlg);

  // 候補から消えた年度を表示していたら先頭へ戻す
  useEffect(() => { if (!years.includes(year)) setYear(years[0]); }, [years, year]);

  const todayStr = ymd(new Date());
  const yearItems = useMemo(() => items.filter((i) => Number(i.grad) === year), [items, year]);
  const prevYear = years.includes(year - 1) ? year - 1 : null;

  const toggleKind = (k) => setKindOff((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const goTab = (grad, tab) => { selectYear?.(grad); setTab?.(tab); };

  const scrollEls = () => Object.values(scrollRefs.current).filter(Boolean);
  const scrollToToday = (smooth) => {
    const p = posInCycle(year, todayStr);
    const left = Number.isFinite(p) ? Math.max(0, p * COL - 220) : 0;
    scrollEls().forEach((el) => { if (smooth) el.scrollTo({ left, behavior: "smooth" }); else el.scrollLeft = left; });
  };
  // 片方のボードを横スクロールしたら、もう片方も同じ位置へ（同じ月の列が縦に揃うように）
  const syncScroll = (src) => {
    scrollEls().forEach((el) => { if (el !== src && Math.abs(el.scrollLeft - src.scrollLeft) > 1) el.scrollLeft = src.scrollLeft; });
  };
  const setScrollEl = (grad, el) => {
    scrollRefs.current[grad] = el;
    if (!el) return;
    const other = scrollEls().find((o) => o !== el); // 後から出たボード（前年度の重ね表示をオンにした時など）は既存の位置に合わせる
    if (other) el.scrollLeft = other.scrollLeft;
  };
  const jumpToday = () => {
    if (pc) scrollToToday(true);
    else document.getElementById("ml-plan-this-month")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 初期表示・年度切替で今月の列が見える位置へ
  useEffect(() => { scrollToToday(false); }, [year, pc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ドロワー ----
  const openNew = () => { setDrawerErr(""); setDrawer({ item: emptyItem(year, todayStr) }); };
  const openEdit = (item) => {
    setDrawerErr(""); setOutsideOpen(null); setMoreDlg(null);
    const start = item.start || "";
    const end = item.end || item.start || "";
    setDrawer({ item: { ...item, start, end, ...periodMode(start, end) } });
  };
  const closeDrawer = () => setDrawer(null);
  const patchItem = (patch) => { setDrawerErr(""); setDrawer((d) => (d ? { ...d, item: { ...d.item, ...patch } } : d)); };

  const saveItem = async () => {
    if (!drawer || busy) return;
    const it = drawer.item;
    if (!it.title.trim()) { setDrawerErr("活動名を入力してください"); return; }
    if (!it.start) { setDrawerErr(it.byMonth ? "開始月を選んでください" : "開始日を入力してください"); return; }
    const { start, end } = resolvePeriod(it); // チェック状態（開始日と同じ／月で入力）を日付に落とす
    const data = {
      grad: Number(it.grad), kind: it.kind in PLAN_KINDS ? it.kind : "other", title: it.title.trim(),
      start, end, status: it.status in PLAN_STATUS ? it.status : "plan", owner: it.owner || "", memo: it.memo || "",
    };
    setBusy(true);
    try {
      if (it.id) await touchPlanItem(it.id, data);
      else await addPlanItem(data);
      setDrawer(null);
    } catch (e) {
      console.error(e);
      setDrawerErr("保存に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally { setBusy(false); }
  };

  const removeItem = async () => {
    if (!drawer?.item?.id || busy) return;
    setBusy(true);
    try {
      await deleteTemplate(drawer.item.id);
      setDrawer(null);
    } catch (e) {
      console.error(e);
      setDrawerErr("削除に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally { setBusy(false); }
  };

  // ---- 前年度からコピー ----
  // 件数0や前年度なしのときも同じダイアログで案内する（共通バナーは赤いエラー表示なので使わない）
  const askCopy = () => {
    setCopyErr("");
    const count = prevYear ? items.filter((i) => Number(i.grad) === prevYear && i.status !== "cancel").length : 0;
    setCopyDlg({ from: prevYear, to: year, count });
  };
  const runCopy = async () => {
    if (!copyDlg || !copyDlg.count || busy) return;
    const src = items.filter((i) => Number(i.grad) === copyDlg.from && i.status !== "cancel");
    setBusy(true);
    try {
      // 一括書き込み（全件成功か全件失敗）。途中失敗で一部だけ残り、やり直すと重複する事故を防ぐ
      await addPlanItems(src.map((i) => ({
        grad: copyDlg.to, kind: i.kind, title: i.title, start: shiftYear(i.start, 1), end: shiftYear(i.end || i.start, 1),
        status: "plan", owner: i.owner || "", memo: "",
      })));
      setCopyDlg(null);
    } catch (e) {
      console.error(e);
      setCopyErr("追加できませんでした（1件も追加されていません）。通信状況を確認してもう一度お試しください。");
    } finally { setBusy(false); }
  };

  // ---- 年表1枚分のデータ ----
  const boardData = (grad) => {
    const mine = items.filter((i) => Number(i.grad) === grad);
    const inRange = mine.filter((i) => inCycle(grad, i.start));
    const outsideItems = mine.filter((i) => !inCycle(grad, i.start));
    const outside = outsideItems.length;
    const lanes = Object.entries(PLAN_KINDS)
      .filter(([k]) => !kindOff.has(k))
      .map(([k, def]) => {
        const laneItems = inRange.filter((i) => i.kind === k);
        return { key: k, label: def.label, items: laneItems, done: laneItems.filter((i) => i.status === "done").length, ...layoutRows(laneItems, grad) };
      });
    const autoLanes = showAuto
      ? AUTO_LANES.map((def) => {
        let rows = def.pick({ events, surveys, articles, broadcasts, savedTemplates, grad }).filter((r) => r.start && inCycle(grad, r.start));
        if (def.monthly) rows = monthlyCounts(rows, grad);
        return { key: def.key, label: def.label, tab: def.tab, items: rows, ...layoutRows(rows, grad) };
      })
      : [];
    return { mine, outside, outsideItems, lanes, autoLanes, done: mine.filter((i) => i.status === "done").length, planned: mine.filter((i) => i.status === "plan").length };
  };

  const cardStyle = (item, kind) => {
    const def = PLAN_KINDS[kind] || PLAN_KINDS.other;
    const base = { color: def.color, border: `1px solid ${def.color}59`, background: def.bg };
    if (item.status === "plan") return { ...base, background: "#fff", borderStyle: "dashed" };
    if (item.status === "cancel") return { ...base, textDecoration: "line-through", opacity: 0.55 };
    return base;
  };
  const cardText = (item) => `${item.status === "done" ? "✓ " : ""}${item.title}`;

  // 年表の期間外（年表にも月リストにも出ない）の活動。見出しの件数を押すと一覧が開き、そこから開いて直せる
  const outsideBtn = (grad, d) => d.outside > 0 && (
    <button type="button" onClick={() => setOutsideOpen(outsideOpen === grad ? null : grad)} className="ml-2 underline font-bold" style={{ color: TODAY_FG }}>期間外 {d.outside}件</button>
  );
  const outsidePanel = (grad, d, cls) => outsideOpen === grad && d.outside > 0 && (
    <div className={`rounded-xl border px-3 py-2 text-xs ${cls}`} style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
      <p className="font-bold mb-1.5" style={{ color: TODAY_FG }}>{grad}卒の年表（{cycleMonths(grad)[0].y}/{cycleMonths(grad)[0].m}〜）の期間外の活動です。押して日付か卒年度を直してください。</p>
      <div className="flex flex-wrap gap-1.5">
        {d.outsideItems.map((i) => (
          <button key={i.id} type="button" onClick={() => openEdit(i)} className="px-2 py-1 rounded-lg border bg-white font-bold" style={{ borderColor: HAIR, color: "#374151" }}>{i.title}（{rangeLabel(i.start, i.end)}）</button>
        ))}
      </div>
    </div>
  );

  // ---- 年表（PC） ----
  const renderBoard = (grad, isPrev) => {
    const d = boardData(grad);
    const months = cycleMonths(grad);
    const todayPos = posInCycle(grad, todayStr);
    const todayIdx = Number.isFinite(todayPos) && todayPos >= 0 && todayPos < PLAN_MONTHS ? Math.floor(todayPos) : -1;
    const gridCols = `${LABEL_W}px repeat(${PLAN_MONTHS}, ${COL}px)`;
    const laneBg = { backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${COL - 1}px, ${HAIR} ${COL - 1}px, ${HAIR} ${COL}px)` };
    const renderLane = (lane, auto) => {
      const h = 6 + Math.max(1, lane.rowCount) * ROW_H;
      return (
        <div key={lane.key} style={{ display: "contents" }}>
          <div className="flex items-center text-[11px] font-bold text-gray-500 px-2.5 bg-white border-r border-b border-gray-200" style={{ position: "sticky", left: 0, zIndex: 2, minHeight: h }}>
            <span className="truncate">{lane.label}</span>
            {!auto && <span className="ml-auto font-normal tabular-nums">{lane.done}/{lane.items.length}</span>}
          </div>
          <div className="relative border-b border-gray-200" style={{ gridColumn: `2 / span ${PLAN_MONTHS}`, height: h, ...laneBg }}>
            {todayIdx >= 0 && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: todayIdx * COL, width: COL, background: TODAY_BG, opacity: 0.55 }} />}
            {lane.placed.map(({ item, s, e, row }) => item.more ? (
              <button key={item.id} type="button" title={`${monthLabel(item.start.slice(0, 7))}の${lane.label}をすべて見る`}
                onClick={() => setMoreDlg({ grad, lane, auto, month: item.start.slice(0, 7), items: item.all })}
                className="absolute rounded-md px-1.5 text-[10px] font-bold whitespace-nowrap text-center underline"
                style={{ left: s * COL + 2, width: (e - s) * COL - 4, top: 4 + row * ROW_H, height: 20, lineHeight: "20px", color: "#374151", background: "#fff", border: "1px dashed #9CA3AF" }}>
                他{item.items.length}件
              </button>
            ) : auto ? (
              <button key={item.id} type="button" title={`${item.title}（${rangeLabel(item.start, item.end)}）`}
                onClick={() => goTab(grad, lane.tab)}
                className={`absolute rounded-md px-1.5 text-[10px] font-medium whitespace-nowrap overflow-hidden text-ellipsis ${item.count ? "text-center" : "text-left"}`}
                style={{ left: s * COL + 2, width: (e - s) * COL - 4, top: 4 + row * ROW_H, height: 20, lineHeight: "20px", color: AUTO.color, background: AUTO.bg, border: `1px solid ${AUTO.border}` }}>
                {item.title}
              </button>
            ) : (
              <button key={item.id} type="button" title={`${item.title}（${rangeLabel(item.start, item.end)}・${PLAN_STATUS[item.status] || "予定"}）`}
                onClick={() => openEdit(item)}
                className="absolute rounded-lg px-2 text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis text-left"
                style={{ left: s * COL + 2, width: (e - s) * COL - 4, top: 4 + row * ROW_H, height: CARD_H, lineHeight: `${CARD_H}px`, ...cardStyle(item, lane.key), ...(isPrev ? { filter: "saturate(.6)" } : {}) }}>
                {cardText(item)}
              </button>
            ))}
          </div>
        </div>
      );
    };
    return (
      <div key={grad} className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 ${isPrev ? "bg-gray-50" : ""}`}>
          <p className="text-sm font-bold">{grad}卒{isPrev && <span className="ml-1 text-xs font-normal text-gray-500">（前年度）</span>}</p>
          <p className="text-[11px] text-gray-500">
            {d.done}件 実施済み／{d.planned}件 予定
            {outsideBtn(grad, d)}
          </p>
        </div>
        {outsidePanel(grad, d, "mx-3 my-2")}
        <div ref={(el) => setScrollEl(grad, el)} onScroll={(e) => syncScroll(e.currentTarget)} className="overflow-x-auto">
          <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: "max-content" }}>
            <div className="bg-white border-r border-b border-gray-200 px-2.5 py-1.5 text-[10px] text-gray-400 flex items-end" style={{ position: "sticky", left: 0, zIndex: 3 }}>
              {months[0].y}/{months[0].m}〜{months[PLAN_MONTHS - 1].y}/{months[PLAN_MONTHS - 1].m}
            </div>
            {months.map((m, i) => (
              <div key={m.key} className="border-b border-r border-gray-200 text-center py-1.5 text-[11px] font-bold leading-tight"
                style={i === todayIdx ? { background: TODAY_BG, color: TODAY_FG } : { color: "#6B7280" }}>
                {m.m}月
                <span className="block text-[10px] font-normal" style={{ visibility: i === 0 || m.m === 1 ? "visible" : "hidden" }}>{m.y}</span>
              </div>
            ))}
            {d.lanes.map((lane) => renderLane(lane, false))}
            {d.autoLanes.map((lane) => renderLane(lane, true))}
          </div>
        </div>
      </div>
    );
  };

  // ---- 月リスト（スマホ） ----
  const renderMonthList = (grad, isPrev) => {
    const d = boardData(grad);
    const months = cycleMonths(grad);
    const thisMonth = todayStr.slice(0, 7);
    const kindRows = d.lanes.flatMap((lane) => lane.items.map((i) => ({ ...i, _kind: lane.key })));
    const autoRows = d.autoLanes.flatMap((lane) => lane.items.map((i) => ({ ...i, _lane: lane.label, _tab: lane.tab })));
    const inMonth = (i, m) => i.start <= m.last && (i.end || i.start) >= m.first;
    return (
      <div key={grad} className="mb-4">
        <div className="flex items-center justify-between gap-2 px-1 mb-2">
          <p className="text-sm font-bold">{grad}卒{isPrev && <span className="ml-1 text-xs font-normal text-gray-500">（前年度）</span>}</p>
          <p className="text-[11px] text-gray-500">{d.done}件 実施済み／{d.planned}件 予定{outsideBtn(grad, d)}</p>
        </div>
        {outsidePanel(grad, d, "mb-2")}
        <div className="grid gap-2.5">
          {months.map((m) => {
            const isNow = !isPrev && m.key === thisMonth;
            const rows = kindRows.filter((i) => inMonth(i, m)).sort((a, b) => a.start.localeCompare(b.start));
            const auto = autoRows.filter((i) => inMonth(i, m)).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={m.key} id={isNow ? "ml-plan-this-month" : undefined} className="bg-white border rounded-xl px-3 py-2.5" style={{ borderColor: isNow ? "#F59E0B" : HAIR }}>
                <p className="text-[13px] font-bold flex items-baseline gap-2 mb-1">
                  {m.m}月<span className="text-[11px] font-normal text-gray-500">{m.y}</span>
                  {isNow && <span className="ml-auto text-[10px] font-bold px-2 rounded-full" style={{ background: TODAY_BG, color: TODAY_FG }}>今月</span>}
                </p>
                {rows.length === 0 && auto.length === 0 && <p className="text-[11px] text-gray-400">—</p>}
                {rows.map((i) => {
                  const def = PLAN_KINDS[i._kind] || PLAN_KINDS.other;
                  const cancel = i.status === "cancel";
                  return (
                    <button key={i.id} type="button" onClick={() => openEdit(i)} className="w-full flex items-center gap-2 py-1.5 border-t border-gray-100 text-left first:border-t-0">
                      <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, background: def.color, opacity: cancel ? 0.4 : 1 }} />
                      <span className="flex-1 min-w-0 text-xs font-bold truncate" style={cancel ? { textDecoration: "line-through", color: "#9CA3AF" } : undefined}>{cardText(i)}</span>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{rangeLabel(i.start, i.end)}</span>
                      <span className="text-[10px] font-bold px-1.5 rounded-full" style={i.status === "done" ? { background: "#E7F9EE", color: "#059947" } : cancel ? { background: "#F3F4F6", color: "#6B7280" } : { background: BRAND_LIGHT, color: BRAND }}>{PLAN_STATUS[i.status] || "予定"}</span>
                    </button>
                  );
                })}
                {auto.map((i) => (
                  <button key={i.id} type="button" onClick={() => goTab(grad, i._tab)} className="w-full flex items-center gap-2 py-1.5 border-t border-gray-100 text-left text-gray-500">
                    <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, background: "#D1D5DB" }} />
                    <span className="flex-1 min-w-0 text-xs truncate">{i._lane}：{i.title}</span>
                    <span className="text-[11px] whitespace-nowrap">{i.count ? "" : mdLabel(i.start)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderView = pc ? renderBoard : renderMonthList;
  const it = drawer?.item;

  return (
    <div className={pc ? "pt-5" : "px-4 pt-4"}>
      <SectionTitle>年間計画（8月〜翌々年3月）</SectionTitle>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        卒年度ごとに採用活動の予定と実績を1本の年表で見ます。予定は実施したら「実施済み」に、計画になかった活動もその場で追加できます。薄い灰色の行はイベント・アンケート・LINE配信などシステム内の記録です（手入力不要）。
      </p>

      {/* 上部コントロール */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-0.5 text-sm font-bold">
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className="py-1.5 px-3 rounded-lg"
              style={year === y ? { background: BRAND, color: "#fff" } : { color: "#6B7280" }}>{y}卒</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} style={{ accentColor: BRAND }} /> 前年度を重ねて表示
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
          <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} style={{ accentColor: BRAND }} /> システムの記録も表示
        </label>
        <span className="flex-1" />
        <button type="button" onClick={jumpToday} className="text-xs font-bold px-3 py-2 rounded-xl border bg-white text-gray-600" style={{ borderColor: HAIR }}>今月へ</button>
        <button type="button" onClick={askCopy} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl border bg-white" style={{ borderColor: BRAND, color: BRAND }}>
          <Copy size={14} /> 前年度からコピー
        </button>
        <button type="button" onClick={openNew} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white" style={{ background: BRAND }}>
          <Plus size={14} /> 活動を追加
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {Object.entries(PLAN_KINDS).map(([k, def]) => {
          const off = kindOff.has(k);
          return (
            <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={!off} title={off ? "表示する" : "隠す"}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-white"
              style={{ borderColor: HAIR, color: off ? "#9CA3AF" : "#374151", opacity: off ? 0.5 : 1 }}>
              <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: def.color }} />{def.label}
            </button>
          );
        })}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 ml-1">
          <span className="inline-block rounded border border-dashed border-gray-400 bg-white" style={{ width: 14, height: 10 }} />予定
          <span className="inline-block rounded bg-gray-300 ml-1" style={{ width: 14, height: 10 }} />✓ 実施済み
          <span className="line-through ml-1">中止</span>
        </span>
      </div>

      {yearItems.length === 0 && (
        <p className="text-xs text-gray-500 bg-white border border-dashed rounded-xl px-3 py-2.5 mb-3" style={{ borderColor: HAIR }}>
          {year}卒にはまだ活動がありません。「＋ 活動を追加」か「前年度からコピー」から始められます。
        </p>
      )}

      {renderView(year, false)}
      {overlay && prevYear && renderView(prevYear, true)}

      {/* 活動ドロワー */}
      {it && (
        <div className="fixed inset-0 z-[65] flex justify-end">
          <div className="absolute inset-0" style={{ background: "rgba(58,42,48,0.40)" }} onClick={closeDrawer} />
          <div className={`ml-drawer relative h-full w-full ${pc ? "max-w-[440px]" : "max-w-lg"} bg-white flex flex-col`} style={{ boxShadow: "-12px 0 40px rgba(58,42,48,0.20)" }}>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: BRAND }}>{it.id ? "✎ 活動を編集" : "活動を追加"}</p>
                <p className="text-base font-bold truncate">{it.title || "新しい活動"}</p>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="閉じる" className="shrink-0 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">活動名<span className="text-red-500 ml-0.5">*</span></p>
                <input value={it.title} onChange={(e) => patchItem({ title: e.target.value })} placeholder="例）合同説明会（マイナビ）"
                  className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm" />
              </div>
              <div className={pc ? "grid grid-cols-2 gap-2" : "space-y-3"}>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-500 mb-1">卒年度</p>
                  <select value={it.grad} onChange={(e) => patchItem({ grad: Number(e.target.value) })} className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
                    {years.map((y) => <option key={y} value={y}>{y}卒</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-500 mb-1">種類</p>
                  <select value={it.kind} onChange={(e) => patchItem({ kind: e.target.value })} className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
                    {Object.entries(PLAN_KINDS).map(([k, def]) => <option key={k} value={k}>{def.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1.5">
                  <p className="text-xs font-bold text-gray-500">期間</p>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={!!it.sameDay} onChange={(e) => patchItem({ sameDay: e.target.checked })} style={{ accentColor: BRAND }} />
                    {it.byMonth ? "1か月だけ（終了月を入れない）" : "開始日と同じ（終了日を入れない）"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={!!it.byMonth} onChange={(e) => patchItem({ byMonth: e.target.checked })} style={{ accentColor: BRAND }} />
                    月で入力
                  </label>
                </div>
                {it.byMonth ? (
                  <div className={pc && !it.sameDay ? "grid grid-cols-2 gap-2" : "space-y-3"}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-500 mb-1">開始月<span className="text-red-500 ml-0.5">*</span></p>
                      <select value={String(it.start).slice(0, 7)}
                        onChange={(e) => { const ym = e.target.value; const start = `${ym}-01`; patchItem({ start, end: it.end && it.end >= start ? it.end : monthEnd(ym) }); }}
                        className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
                        {monthOptions(Number(it.grad), String(it.start).slice(0, 7)).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </div>
                    {!it.sameDay && (
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-500 mb-1">終了月</p>
                        <select value={String(it.end || it.start).slice(0, 7)} onChange={(e) => patchItem({ end: monthEnd(e.target.value) })}
                          className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
                          {monthOptions(Number(it.grad), String(it.start).slice(0, 7), String(it.end || it.start).slice(0, 7))
                            .filter((o) => o.key >= String(it.start).slice(0, 7))
                            .map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={pc && !it.sameDay ? "grid grid-cols-2 gap-2" : "space-y-3"}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-500 mb-1">開始日<span className="text-red-500 ml-0.5">*</span></p>
                      <input type="date" value={it.start} onChange={(e) => patchItem({ start: e.target.value, end: it.end && it.end >= e.target.value ? it.end : e.target.value })}
                        className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    {!it.sameDay && (
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-500 mb-1">終了日</p>
                        <input type="date" value={it.end} min={it.start || undefined} onChange={(e) => patchItem({ end: e.target.value })}
                          className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">1日だけ・1か月だけの活動は年表の月の枠に収まり、○〜○の期間は日付の位置に幅をとって出ます。</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">担当者<span className="font-normal text-gray-400 ml-1">（任意）</span></p>
                <input value={it.owner} onChange={(e) => patchItem({ owner: e.target.value })} className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">状態</p>
                <div className="flex gap-1.5">
                  {Object.entries(PLAN_STATUS).map(([k, label]) => {
                    const on = it.status === k;
                    const bg = k === "done" ? "#059947" : k === "cancel" ? "#6B7280" : BRAND;
                    return (
                      <button key={k} type="button" aria-pressed={on} onClick={() => patchItem({ status: k })}
                        className="flex-1 py-2 rounded-lg border text-xs font-bold"
                        style={on ? { background: bg, borderColor: bg, color: "#fff" } : { background: "#fff", borderColor: HAIR, color: "#6B7280" }}>{label}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">メモ<span className="font-normal text-gray-400 ml-1">（実施後の記録など・任意）</span></p>
                <textarea value={it.memo} onChange={(e) => patchItem({ memo: e.target.value })} rows={4} placeholder="例）参加12名、うち特別ルート希望3名。来年は9月上旬に前倒し。"
                  className="w-full min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm leading-relaxed" />
              </div>
              {it.start && !inCycle(Number(it.grad), it.start) && (
                <p className="text-[11px]" style={{ color: TODAY_FG }}>この日付は {it.grad}卒の年表の期間外です（年表・月リストには出ません）。日付か卒年度を見直してください。</p>
              )}
              {it.id && (
                <div className="pt-2">
                  {drawer.confirmDel ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={removeItem} disabled={busy} className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: "#DC2626" }}>削除する</button>
                      <button type="button" onClick={() => setDrawer({ ...drawer, confirmDel: false })} className="flex-1 py-2 rounded-lg text-xs font-bold border bg-white text-gray-600" style={{ borderColor: HAIR }}>取消</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setDrawer({ ...drawer, confirmDel: true })} className="text-xs font-bold" style={{ color: "#DC2626" }}>この活動を削除</button>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 shrink-0">
              {drawerErr && <p className="text-xs font-bold mb-2" style={{ color: "#DC2626" }}>{drawerErr}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={closeDrawer} className="px-4 py-2.5 rounded-xl text-sm font-bold border bg-white text-gray-600" style={{ borderColor: HAIR }}>閉じる</button>
                <button type="button" onClick={saveItem} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                  {busy ? "保存中…" : "保存する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 年表の「他N件」一覧ドロワー */}
      {moreDlg && (
        <div className="fixed inset-0 z-[65] flex justify-end">
          <div className="absolute inset-0" style={{ background: "rgba(58,42,48,0.40)" }} onClick={() => setMoreDlg(null)} />
          <div className={`ml-drawer relative h-full w-full ${pc ? "max-w-[440px]" : "max-w-lg"} bg-white flex flex-col`} style={{ boxShadow: "-12px 0 40px rgba(58,42,48,0.20)" }}>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: BRAND }}>{moreDlg.grad}卒・{monthLabel(moreDlg.month)}</p>
                <p className="text-base font-bold truncate">{moreDlg.lane.label}（{moreDlg.items.length}件）</p>
              </div>
              <button type="button" onClick={() => setMoreDlg(null)} aria-label="閉じる" className="shrink-0 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2">
              <p className="text-[11px] text-gray-500 py-2">この月の全件です（年表には先頭3件だけ出しています）。{moreDlg.auto ? "押すと元の画面へ移ります。" : "押すと開いて直せます。"}</p>
              {moreDlg.items.map((i) => moreDlg.auto ? (
                <button key={i.id} type="button" onClick={() => { setMoreDlg(null); goTab(moreDlg.grad, moreDlg.lane.tab); }}
                  className="w-full flex items-center gap-2 py-2.5 border-t border-gray-100 text-left text-gray-600">
                  <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, background: "#D1D5DB" }} />
                  <span className="flex-1 min-w-0 text-sm truncate">{i.title}</span>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{mdLabel(i.start)}</span>
                </button>
              ) : (
                <button key={i.id} type="button" onClick={() => openEdit(i)} className="w-full flex items-center gap-2 py-2.5 border-t border-gray-100 text-left">
                  <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, background: (PLAN_KINDS[moreDlg.lane.key] || PLAN_KINDS.other).color, opacity: i.status === "cancel" ? 0.4 : 1 }} />
                  <span className="flex-1 min-w-0 text-sm font-bold truncate" style={i.status === "cancel" ? { textDecoration: "line-through", color: "#9CA3AF" } : undefined}>{cardText(i)}</span>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{rangeLabel(i.start, i.end)}</span>
                  <span className="text-[10px] font-bold px-1.5 rounded-full" style={i.status === "done" ? { background: "#E7F9EE", color: "#059947" } : i.status === "cancel" ? { background: "#F3F4F6", color: "#6B7280" } : { background: BRAND_LIGHT, color: BRAND }}>{PLAN_STATUS[i.status] || "予定"}</span>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 shrink-0">
              <button type="button" onClick={() => setMoreDlg(null)} className="w-full py-2.5 rounded-xl text-sm font-bold border bg-white text-gray-600" style={{ borderColor: HAIR }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 前年度からコピーの確認 */}
      {copyDlg && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <div className="absolute inset-0" style={{ background: "rgba(58,42,48,0.40)" }} onClick={() => !busy && setCopyDlg(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <p className="text-sm font-bold mb-2">前年度の計画をコピー</p>
            <p className="text-sm leading-relaxed text-gray-700">
              {!copyDlg.from
                ? `${copyDlg.to - 1}卒の計画がありません（年度の候補にない年度はコピー元にできません）。`
                : copyDlg.count === 0
                  ? `${copyDlg.from}卒にコピーできる活動がありません（中止の活動はコピーしません）。`
                  : `${copyDlg.from}卒の活動 ${copyDlg.count}件を ${copyDlg.to}卒に「予定」として追加します。日付は1年後ろにずらし、メモは引き継ぎません。すでにコピー済みでも重複して追加されます。`}
            </p>
            {copyErr && <p className="text-xs font-bold mt-2" style={{ color: "#DC2626" }}>{copyErr}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setCopyDlg(null)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold border bg-white text-gray-600" style={{ borderColor: HAIR }}>{copyDlg.count ? "やめる" : "閉じる"}</button>
              {copyDlg.count > 0 && (
                <button type="button" onClick={runCopy} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>{busy ? "追加中…" : `${copyDlg.count}件を追加`}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
