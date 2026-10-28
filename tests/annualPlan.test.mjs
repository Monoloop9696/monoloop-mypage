import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleStart, cycleMonths, posInCycle, inCycle, layoutRows, shiftYear, planYears, PLAN_MONTHS } from "../src/lib/annualPlan.js";

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

test("defaultPlanDate: 今日が期間内ならそのまま、期間外なら期間の初日", async () => {
  const { defaultPlanDate } = await import("../src/lib/annualPlan.js");
  assert.equal(defaultPlanDate(2028, "2026-10-28"), "2026-10-28");
  assert.equal(defaultPlanDate(2029, "2026-10-28"), "2027-08-01");
  assert.equal(defaultPlanDate(2027, "2026-10-28"), "2026-10-28");
  assert.equal(defaultPlanDate(2026, "2026-10-28"), "2024-08-01");
});
