// 年間計画（採用活動の年表）の純粋ロジック。
// 1本の年表＝1つの卒年度。期間は卒業年の2年前の8月1日〜卒業年の3月31日（20か月）。
export const PLAN_START_MONTH = 8;
export const PLAN_MONTHS = 20;

// 順序＝レーンの並び
export const PLAN_KINDS = {
  seminar: { label: "説明会", color: "#4F46E5", bg: "#EEF2FF" },
  oc: { label: "オープンカンパニー", color: "#EA580C", bg: "#FFF4E5" },
  select: { label: "選考", color: "#E4007F", bg: "#FCE3EF" },
  follow: { label: "内定者フォロー", color: "#059947", bg: "#E7F9EE" },
  media: { label: "媒体・スカウト", color: "#0891B2", bg: "#E0F7FA" },
  campus: { label: "学内・大学", color: "#7C3AED", bg: "#F3E8FF" },
  other: { label: "その他", color: "#6B7280", bg: "#F3F4F6" },
};

export const PLAN_STATUS = { plan: "予定", done: "実施済み", cancel: "中止" };

const pad2 = (n) => String(n).padStart(2, "0");

export const ymd = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parse = (dateStr) => {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  return { y, m, d };
};

const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m は 1〜12

export const cycleStart = (grad) => new Date(grad - 2, PLAN_START_MONTH - 1, 1);

export const cycleMonths = (grad) => {
  const start = cycleStart(grad);
  const out = [];
  for (let i = 0; i < PLAN_MONTHS; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${pad2(m)}`;
    out.push({ y, m, key, first: `${key}-01`, last: `${key}-${pad2(daysInMonth(y, m))}` });
  }
  return out;
};

// 列インデックス＋月内の割合（月初＝整数）。期間外は負または 20 以上になる。
// 月内の割合は 30 日換算（(日-1)/30、31日は30日と同じ位置）。月の長さに依らず「16日＝.5」になる。
export const posInCycle = (grad, dateStr) => {
  const { y, m, d } = parse(dateStr);
  if (!y || !m || !d) return NaN;
  const start = cycleStart(grad);
  const monthIdx = (y - start.getFullYear()) * 12 + (m - 1 - start.getMonth());
  return monthIdx + Math.min(d - 1, 29) / 30;
};

export const inCycle = (grad, dateStr) => {
  const p = posInCycle(grad, dateStr);
  return Number.isFinite(p) && p >= 0 && p < PLAN_MONTHS;
};

const byDate = (a, b) => String(a.start).localeCompare(String(b.start)) || String(a.end || a.start).localeCompare(String(b.end || b.start));
const isSingleDay = (item) => !item.end || item.end === item.start;

// レーン内の配置。
// - 単日の項目（終了日なし／開始日と同じ）は「月の枠」に収める（列の整数位置・幅1）。同じ月に maxPerMonth 件を超えると
//   先頭 maxPerMonth 件だけ置き、残りを { more:true, items:[…] } の1件にまとめる（画面側で「他N件」として一覧を開く）。
// - ○〜○の期間がある項目は日の位置に置く（最小幅 minWidth か月）。期間末の列を越えない。
// 行は start 昇順に、重ならない最小の行へ。
export const layoutRows = (items, grad, { minWidth = 0.95, maxPerMonth = 3 } = {}) => {
  const entries = [];
  const perMonth = new Map();
  [...items].sort(byDate).forEach((item) => {
    const s = posInCycle(grad, item.start);
    if (isSingleDay(item)) {
      const m = Math.floor(s);
      if (!perMonth.has(m)) perMonth.set(m, []);
      perMonth.get(m).push(item);
      return;
    }
    const rawEnd = posInCycle(grad, item.end) + 1 / 30;
    const e = Math.min(PLAN_MONTHS, Math.max(rawEnd, s + minWidth + 1e-9)); // 浮動小数の誤差で幅が minWidth を割らないよう僅かに足す
    entries.push({ item, s, e });
  });
  perMonth.forEach((list, m) => {
    const shown = list.length > maxPerMonth ? list.slice(0, maxPerMonth) : list;
    shown.forEach((item) => entries.push({ item, s: m, e: m + 1 }));
    if (list.length > maxPerMonth) {
      const rest = list.slice(maxPerMonth);
      const first = rest[0];
      // items＝年表に出していない残り、all＝その月の全件（一覧ドロワー用）
      entries.push({ item: { id: `more:${m}:${first.id}`, more: true, items: rest, all: list, title: `他${rest.length}件`, start: first.start, end: first.start }, s: m, e: m + 1 });
    }
  });
  entries.sort((a, b) => a.s - b.s || (a.item.more ? 1 : 0) - (b.item.more ? 1 : 0) || byDate(a.item, b.item));
  const rowEnds = [];
  const placed = entries.map((en) => {
    let row = rowEnds.findIndex((end) => end <= en.s + 0.02);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(en.e);
    } else {
      rowEnds[row] = en.e;
    }
    return { ...en, row };
  });
  return { placed, rowCount: rowEnds.length };
};

// "YYYY-MM" → その月の末日 "YYYY-MM-DD"
export const monthEnd = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  return `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
};

// ドロワーの「開始日と同じ」「月で入力」チェックから、保存する開始日・終了日を決める。
//   月で入力: 開始＝その月の1日、終了＝（開始日と同じなら同じ月の／そうでなければ終了月の）末日
//   開始日と同じ: 終了＝開始
//   終了が開始より前なら開始に合わせる
export const resolvePeriod = ({ start, end, sameDay, byMonth }) => {
  if (byMonth) {
    const sm = String(start).slice(0, 7);
    const s = `${sm}-01`;
    let e = sameDay || !end ? monthEnd(sm) : monthEnd(String(end).slice(0, 7));
    if (e < s) e = monthEnd(sm);
    return { start: s, end: e };
  }
  if (sameDay || !end || end < start) return { start, end: start };
  return { start, end };
};

// 保存済みの開始日・終了日からチェック状態を復元する（1日〜末日なら「月で入力」、同じ月なら「開始日と同じ」も）
export const periodMode = (start, end) => {
  const s = String(start || "");
  const e = String(end || "");
  const byMonth = !!s && !!e && e !== s && s.endsWith("-01") && e === monthEnd(e.slice(0, 7));
  const sameDay = byMonth ? e.slice(0, 7) === s.slice(0, 7) : !e || e === s;
  return { sameDay, byMonth };
};

// 日付を n 年ずらす。2/29 がうるう年でなくなる場合は 2/28 に丸める。
export const shiftYear = (dateStr, n) => {
  const { y, m, d } = parse(dateStr);
  const ny = y + n;
  const nd = Math.min(d, daysInMonth(ny, m));
  return `${ny}-${pad2(m)}-${pad2(nd)}`;
};

// 年度候補: cohorts の year ∪ items の grad ∪ (最大+1)。降順。空なら今年+2。
export const planYears = ({ cohorts = [], items = [] } = {}) => {
  const set = new Set();
  cohorts.forEach((c) => Number.isFinite(Number(c.year)) && set.add(Number(c.year)));
  items.forEach((i) => Number.isFinite(Number(i.grad)) && set.add(Number(i.grad)));
  if (set.size === 0) return [new Date().getFullYear() + 2];
  set.add(Math.max(...set) + 1);
  return [...set].sort((a, b) => b - a);
};

// 新しい活動の既定日: 今日が年表の期間内ならそのまま、期間外なら期間の初日（期間外のカードを作ってしまわないため）
export const defaultPlanDate = (grad, todayStr) => (inCycle(grad, todayStr) ? todayStr : ymd(cycleStart(grad)));
