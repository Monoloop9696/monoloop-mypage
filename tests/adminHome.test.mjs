import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminTodos, buildUpcoming } from "../src/lib/adminHome.js";

const TODAY = "2026-11-05"; // 木曜

test("buildAdminTodos: 要対応（質問・特別選考・面談）→ 期限が近い順の未回答 → お知らせ の順", () => {
  const todos = buildAdminTodos({
    unansweredQ: 2, specialNew: 3, proposalsWaiting: 1,
    events: [
      { id: "e1", title: "内定者懇親会", deadlineDate: "2026-11-13", dateStr: "2026-11-20", target: 24, unanswered: 6 },
      { id: "e2", title: "店舗見学ツアー", deadlineDate: "2026-11-07", dateStr: "2026-12-05", target: 7, unanswered: 6 },
      { id: "e9", title: "全員回答済みの会", deadlineDate: "2026-11-06", dateStr: "2026-11-10", target: 5, unanswered: 0 },
    ],
    surveys: [{ id: "s1", title: "入社前アンケート", dueDate: "2026-11-15", target: 24, unanswered: 11 }],
    followHigh: 2, lineUnlinked: 3, todayStr: TODAY,
  });
  assert.deepEqual(todos.map((t) => t.key), ["qbox", "special", "interview", "event:e2", "event:e1", "survey:s1", "follow", "line"]);
  const e2 = todos.find((t) => t.key === "event:e2");
  assert.equal(e2.tone, "danger", "期限まで3日以内は赤");
  assert.equal(e2.sub, "回答 1 / 7名・期限 11/7（土）（あと2日）");
  assert.deepEqual(e2.action, { label: "未回答者にLINE", type: "line", target: "event:e2:none" });
  const e1 = todos.find((t) => t.key === "event:e1");
  assert.equal(e1.tone, "warn");
  assert.equal(e1.title, "内定者懇親会：出欠の未回答が6名");
  assert.equal(todos.find((t) => t.key === "survey:s1").action.target, "survey:s1:unanswered");
  assert.deepEqual(todos.find((t) => t.key === "follow").action, { label: "一覧を見る", type: "follow" });
});

test("buildAdminTodos: 対応するものが無ければ空。期限なしのアンケートは後ろに並ぶ", () => {
  assert.deepEqual(buildAdminTodos({ todayStr: TODAY }), []);
  const todos = buildAdminTodos({
    surveys: [{ id: "s0", title: "期限なし", dueDate: "", target: 3, unanswered: 1 }, { id: "s1", title: "期限あり", dueDate: "2026-11-30", target: 3, unanswered: 2 }],
    todayStr: TODAY,
  });
  assert.deepEqual(todos.map((t) => t.key), ["survey:s1", "survey:s0"]);
  assert.equal(todos[1].sub, "回答 2 / 3名・期限なし");
});

test("buildUpcoming: 今日から7日先までを日付・時刻順に。締切はその日の最後、範囲外は出さない", () => {
  const list = buildUpcoming({
    bookings: [
      { date: "2026-11-09", start: "10:30", end: "11:00", name: "高橋 七海", interviewer: "今井" },
      { date: "2026-11-06", start: "14:00", end: "14:30", name: "石川 蓮", interviewer: "" },
      { date: "2026-11-20", start: "10:00", end: "10:30", name: "範囲外" },
    ],
    events: [{ title: "店舗見学ツアー", dateStr: "2026-11-07", time: "13:00", place: "栄店" }, { title: "過去の会", dateStr: "2026-11-04", time: "10:00" }],
    deadlines: [{ title: "店舗見学ツアー", kind: "event", date: "2026-11-07", unanswered: 6 }, { title: "入社前アンケート", kind: "survey", date: "2026-11-12", unanswered: 0 }],
    articles: [{ title: "入社前研修のご案内", date: "2026-11-05", time: "09:00" }],
    todayStr: TODAY,
  });
  assert.deepEqual(list.map((x) => `${x.label} ${x.title}`), [
    "11/5（木） 記事の予約投稿",
    "11/6（金） 面談：石川 蓮さん",
    "11/7（土） 店舗見学ツアー",
    "11/7（土） 店舗見学ツアーの出欠 締切",
    "11/9（月） 面談：高橋 七海さん",
    "11/12（木） 入社前アンケートの回答 締切",
  ]);
  assert.equal(list[0].today, true);
  assert.equal(list[1].sub, "14:00〜14:30");
  assert.equal(list[4].sub, "10:30〜11:00・担当 今井");
  assert.equal(list[3].sub, "未回答 6名");
  assert.equal(list[5].sub, "全員回答済み");
});
