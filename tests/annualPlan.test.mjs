import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cycleStart, cycleMonths, posInCycle, inCycle, layoutRows, shiftYear, planYears, PLAN_MONTHS,
  monthEnd, resolvePeriod, periodMode,
} from "../src/lib/annualPlan.js";

test("cycleStart/cycleMonths: 2028卒は2026-08から20か月で2028-03まで", () => {
  assert.equal(cycleStart(2028).getFullYear(), 2026);
  assert.equal(cycleStart(2028).getMonth(), 7);
  const ms = cycleMonths(2028);
  assert.equal(ms.length, PLAN_MONTHS);
  assert.deepEqual([ms[0].key, ms[19].key], ["2026-08", "2028-03"]);
  assert.equal(ms[5].last, "2027-01-31");
});
test("posInCycle: 月初は整数、月内は割合", () => {
  assert.equal(posInCycle(2028, "2026-08-01"), 0);
  assert.equal(posInCycle(2028, "2026-10-01"), 2);
  assert.ok(Math.abs(posInCycle(2028, "2026-10-16") - 2.5) < 0.01);
});
test("inCycle: 期間外は false", () => {
  assert.equal(inCycle(2028, "2026-07-31"), false);
  assert.equal(inCycle(2028, "2028-03-31"), true);
  assert.equal(inCycle(2028, "2028-04-01"), false);
});
test("layoutRows: 同日3件は3行、離れた2件は同じ行", () => {
  const items = [
    { id: "a", start: "2026-10-05", end: "2026-10-05" },
    { id: "b", start: "2026-10-05", end: "2026-10-05" },
    { id: "c", start: "2026-10-05", end: "2026-10-05" },
    { id: "d", start: "2027-01-10", end: "2027-01-12" },
  ];
  const { placed, rowCount } = layoutRows(items, 2028);
  assert.equal(rowCount, 3);
  const rowOf = (id) => placed.find((p) => p.item.id === id).row;
  assert.deepEqual([rowOf("a"), rowOf("b"), rowOf("c"), rowOf("d")], [0, 1, 2, 0]);
  assert.ok(placed[0].e - placed[0].s >= 0.95);
});
test("shiftYear: うるう日は2/28に丸める", () => {
  assert.equal(shiftYear("2028-02-29", 1), "2029-02-28");
  assert.equal(shiftYear("2026-10-05", 1), "2027-10-05");
  assert.equal(shiftYear("2027-03-31", -1), "2026-03-31");
});
test("planYears: 最大+1 を含む、降順、重複なし", () => {
  assert.deepEqual(planYears({ cohorts: [{ year: 2027 }, { year: 2028 }], items: [{ grad: 2027 }] }), [2029, 2028, 2027]);
  assert.deepEqual(planYears({ cohorts: [], items: [] }), [new Date().getFullYear() + 2]);
});

test("layoutRows: 単日の項目は月の枠（整数位置・幅1）に収まり、○〜○の期間は日の位置に置く", () => {
  const items = [
    { id: "single", start: "2026-10-16", end: "2026-10-16" },
    { id: "noEnd", start: "2026-11-20" },
    { id: "range", start: "2026-12-10", end: "2026-12-12" },
    { id: "tail", start: "2028-03-20", end: "2028-03-31" },
  ];
  const { placed } = layoutRows(items, 2028);
  const of = (id) => placed.find((p) => p.item.id === id);
  assert.deepEqual([of("single").s, of("single").e], [2, 3]);
  assert.deepEqual([of("noEnd").s, of("noEnd").e], [3, 4]);
  assert.ok(of("range").s > 4.2 && of("range").s < 4.4);
  assert.ok(of("tail").e <= PLAN_MONTHS, "期間末のカードは最後の列を越えない");
});
test("layoutRows: 同じ月の単日項目は3件まで表示し、残りは「他N件」1行にまとめる", () => {
  const items = [1, 2, 3, 4, 5].map((d) => ({ id: `i${d}`, start: `2026-10-0${d}`, end: `2026-10-0${d}` }));
  items.push({ id: "nov", start: "2026-11-03", end: "2026-11-03" });
  const { placed, rowCount } = layoutRows(items, 2028);
  assert.equal(rowCount, 4);
  const oct = placed.filter((p) => p.s === 2);
  assert.equal(oct.length, 4);
  const more = oct.find((p) => p.item.more);
  assert.ok(more, "他N件のエントリがある");
  assert.deepEqual(more.item.items.map((i) => i.id), ["i4", "i5"]);
  assert.deepEqual(more.item.all.map((i) => i.id), ["i1", "i2", "i3", "i4", "i5"], "一覧用にはその月の全件を持つ");
  assert.equal(more.row, 3);
  assert.deepEqual(oct.filter((p) => !p.item.more).map((p) => p.item.id).sort(), ["i1", "i2", "i3"]);
  assert.equal(placed.find((p) => p.item.id === "nov").row, 0);
  const { rowCount: three } = layoutRows(items.slice(0, 3), 2028);
  assert.equal(three, 3, "3件ならまとめない");
});
test("monthEnd: 月末日（うるう年対応）", () => {
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(monthEnd("2026-10"), "2026-10-31");
});
test("resolvePeriod: チェック状態から保存する開始日・終了日を決める", () => {
  assert.deepEqual(resolvePeriod({ start: "2026-10-16", end: "2026-10-16", sameDay: true, byMonth: true }), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(resolvePeriod({ start: "2026-10-05", end: "2027-02-10", sameDay: false, byMonth: true }), { start: "2026-10-01", end: "2027-02-28" });
  assert.deepEqual(resolvePeriod({ start: "2026-10-05", end: "2026-09-10", sameDay: false, byMonth: true }), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(resolvePeriod({ start: "2026-10-05", end: "2026-10-20", sameDay: true, byMonth: false }), { start: "2026-10-05", end: "2026-10-05" });
  assert.deepEqual(resolvePeriod({ start: "2026-10-05", end: "2026-10-02", sameDay: false, byMonth: false }), { start: "2026-10-05", end: "2026-10-05" });
  assert.deepEqual(resolvePeriod({ start: "2026-10-05", end: "2026-10-07", sameDay: false, byMonth: false }), { start: "2026-10-05", end: "2026-10-07" });
});
test("periodMode: 保存済みの日付からチェック状態を復元する", () => {
  assert.deepEqual(periodMode("2026-10-05", "2026-10-05"), { sameDay: true, byMonth: false });
  assert.deepEqual(periodMode("2026-10-05", ""), { sameDay: true, byMonth: false });
  assert.deepEqual(periodMode("2026-10-01", "2026-10-01"), { sameDay: true, byMonth: false });
  assert.deepEqual(periodMode("2026-10-01", "2026-10-31"), { sameDay: true, byMonth: true });
  assert.deepEqual(periodMode("2026-10-01", "2026-12-31"), { sameDay: false, byMonth: true });
  assert.deepEqual(periodMode("2026-10-05", "2026-10-07"), { sameDay: false, byMonth: false });
});

test("defaultPlanDate: 今日が期間内ならそのまま、期間外なら期間の初日", async () => {
  const { defaultPlanDate } = await import("../src/lib/annualPlan.js");
  assert.equal(defaultPlanDate(2028, "2026-10-28"), "2026-10-28");
  assert.equal(defaultPlanDate(2029, "2026-10-28"), "2027-08-01");
  assert.equal(defaultPlanDate(2027, "2026-10-28"), "2026-10-28");
  assert.equal(defaultPlanDate(2026, "2026-10-28"), "2024-08-01");
});
