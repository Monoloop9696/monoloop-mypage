import { test } from "node:test";
import assert from "node:assert/strict";
import { slotKindForRoute, weekdayJa, formatSlotLabel, isSlotFull, selectableSlots, validateSlotSelection, allowedSlotIds } from "../src/lib/specialRoute.js";

const S = (o) => ({ id: "x", kind: "seminar", date: "2026-11-05", start: "14:00", end: "15:00", remaining: null, active: true, ...o });

test("slotKindForRoute", () => {
  assert.equal(slotKindForRoute("special1"), "seminar");
  assert.equal(slotKindForRoute("special2"), "oc");
  assert.equal(slotKindForRoute("casual"), null);
});

test("formatSlotLabel: 2026-10-14 は水曜", () => {
  assert.equal(weekdayJa("2026-10-14"), "水");
  assert.equal(formatSlotLabel({ date: "2026-10-14", start: "14:00", end: "15:00" }), "10/14（水）14:00〜15:00");
  assert.equal(formatSlotLabel({ date: "2026-10-14", start: "14:00", end: "" }), "10/14（水）14:00");
});

test("isSlotFull: 0 だけ満員", () => {
  assert.equal(isSlotFull(S({ remaining: 0 })), true);
  assert.equal(isSlotFull(S({ remaining: null })), false);
  assert.equal(isSlotFull(S({ remaining: 3 })), false);
});

test("selectableSlots: 今日より前の枠・停止中・種別違いは除外、日付順", () => {
  const slots = [
    S({ id: "a", date: "2026-11-05", start: "16:00" }),
    S({ id: "b", date: "2026-11-05", start: "10:00" }),
    S({ id: "old", date: "2026-10-01" }),
    S({ id: "off", active: false }),
    S({ id: "oc", kind: "oc" }),
    S({ id: "full", remaining: 0, date: "2026-11-06" }),
  ];
  assert.deepEqual(selectableSlots(slots, { kind: "seminar", today: "2026-10-27" }).map((s) => s.id), ["b", "a", "full"]);
});

test("validateSlotSelection: 満員の枠は除外される", () => {
  const slots = [S({ id: "ok" }), S({ id: "full", remaining: 0 })];
  assert.deepEqual(
    validateSlotSelection({ routeId: "special1", slotIds: ["ok", "full", "nope"], otherDate: false, slots, today: "2026-10-27" }),
    { ok: true, slotIds: ["ok"] }
  );
  assert.equal(validateSlotSelection({ routeId: "special1", slotIds: ["full"], otherDate: false, slots, today: "2026-10-27" }).ok, false);
  assert.deepEqual(
    validateSlotSelection({ routeId: "special1", slotIds: ["full"], otherDate: true, slots, today: "2026-10-27" }),
    { ok: true, slotIds: [] }
  );
});

test("validateSlotSelection: casual と公開枠なしは常に ok", () => {
  assert.deepEqual(
    validateSlotSelection({ routeId: "casual", slotIds: ["ok"], otherDate: false, slots: [S()], today: "2026-10-27" }),
    { ok: true, slotIds: [] }
  );
  assert.deepEqual(
    validateSlotSelection({ routeId: "special1", slotIds: [], otherDate: false, slots: [], today: "2026-10-27" }),
    { ok: true, slotIds: [] }
  );
});

test("allowedSlotIds: 受付中・今日以降・満員でない枠の id だけ", () => {
  const slots = [S({ id: "ok" }), S({ id: "full", remaining: 0 }), S({ id: "old", date: "2026-10-01" }), S({ id: "oc", kind: "oc" })];
  assert.deepEqual([...allowedSlotIds(slots, { kind: "seminar", today: "2026-10-27" })], ["ok"]);
});
