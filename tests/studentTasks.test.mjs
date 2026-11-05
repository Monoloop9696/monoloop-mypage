import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, dueText, buildTasks } from "../src/lib/studentTasks.js";

const TODAY = "2026-11-05"; // 木曜

test("daysLeft: 今日=0、未来は正、過去は負、不正な日付は null", () => {
  assert.equal(daysLeft("2026-11-05", TODAY), 0);
  assert.equal(daysLeft("2026-11-13", TODAY), 8);
  assert.equal(daysLeft("2026-11-04", TODAY), -1);
  assert.equal(daysLeft("2027-01-05", TODAY), 61);
  assert.equal(daysLeft("", TODAY), null);
  assert.equal(daysLeft("11/13", TODAY), null);
});

test("dueText: 日付（曜日）と残り日数の文言、3日以内は urgent", () => {
  assert.deepEqual(dueText("2026-11-13", TODAY), { date: "11/13（金）", left: 8, leftText: "あと8日", urgent: false });
  assert.deepEqual(dueText("2026-11-08", TODAY), { date: "11/8（日）", left: 3, leftText: "あと3日", urgent: true });
  assert.equal(dueText("2026-11-06", TODAY).leftText, "明日まで");
  assert.equal(dueText("2026-11-05", TODAY).leftText, "今日まで");
  assert.equal(dueText(null, TODAY), null);
});

test("buildTasks: LINE未連携が先頭、残りは期限が近い順（期限なしは後ろ）", () => {
  const tasks = buildTasks({
    lineLinked: false,
    profileDone: false,
    interview: { dueDate: "2026-11-20" },
    events: [
      { id: "e2", title: "店舗見学ツアー", dateStr: "2026-12-05", deadlineDate: "2026-11-28" },
      { id: "e1", title: "内定者懇親会", dateStr: "2026-11-20", deadlineDate: "2026-11-13" },
    ],
    surveys: [{ id: "s1", title: "入社前アンケート", dueDate: "2026-11-15", time: "約3分" }],
    todayStr: TODAY,
  });
  assert.deepEqual(tasks.map((t) => t.key), ["line", "event:e1", "survey:s1", "interview", "event:e2", "profile"]);
  const e1 = tasks.find((t) => t.key === "event:e1");
  assert.equal(e1.title, "内定者懇親会の出欠");
  assert.equal(e1.due.leftText, "あと8日");
  const s1 = tasks.find((t) => t.key === "survey:s1");
  assert.equal(s1.note, "約3分");
  assert.equal(tasks.find((t) => t.key === "profile").due, null);
});

test("buildTasks: 回答期限が無いイベントは開催日を期限にする。対応済みなら何も出さない", () => {
  const one = buildTasks({ lineLinked: true, profileDone: true, interview: null, events: [{ id: "e9", title: "見学会", dateStr: "2026-11-10" }], surveys: [], todayStr: TODAY });
  assert.equal(one.length, 1);
  assert.equal(one[0].due.date, "11/10（火）");
  assert.deepEqual(buildTasks({ lineLinked: true, profileDone: true, interview: null, events: [], surveys: [], todayStr: TODAY }), []);
});
