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

// start 昇順に並べ、重ならない最小の行へ置く。
export const layoutRows = (items, grad, { minWidth = 0.95 } = {}) => {
  const sorted = [...items].sort((a, b) => String(a.start).localeCompare(String(b.start)) || String(a.end).localeCompare(String(b.end)));
  const rowEnds = [];
  const placed = sorted.map((item) => {
    const s = posInCycle(grad, item.start);
    const rawEnd = posInCycle(grad, item.end || item.start) + 1 / 30;
    const e = Math.max(rawEnd, s + minWidth + 1e-9); // 浮動小数の誤差で幅が minWidth を割らないよう僅かに足す
    let row = rowEnds.findIndex((end) => end <= s + 0.02);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(e);
    } else {
      rowEnds[row] = e;
    }
    return { item, s, e, row };
  });
  return { placed, rowCount: rowEnds.length };
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
