import { test } from "node:test";
import assert from "node:assert/strict";
import { audienceOf, eventGroupList, resolveRecipients } from "../api/_lib/broadcastTarget.js";

// 2027卒の在籍者4名（関東2・東海2）＋辞退1・削除1
const students = [
  { id: "a", name: "A", grad: 2027, status: "内定", address: "東京都千代田区", lineUserId: "La" },
  { id: "b", name: "B", grad: 2027, status: "承諾", address: "神奈川県横浜市", email: "b@x" },
  { id: "c", name: "C", grad: 2027, status: "内定", address: "愛知県名古屋市", lineUserId: "Lc" },
  { id: "d", name: "D", grad: 2027, status: "承諾", address: "静岡県静岡市", lineUserId: "Ld" },
  { id: "x", name: "X", grad: 2027, status: "辞退", address: "東京都", lineUserId: "Lx" },
  { id: "y", name: "Y", grad: 2027, status: "承諾", deleted: true, lineUserId: "Ly" },
];
const ids = (list) => list.map((s) => s.id).sort();

const kantoEvent = { id: "ev1", areas: ["kanto"], areaBasis: "either" };
const rsvps = [{ eventId: "ev1", uid: "a", answer: "yes", arrived: true }, { eventId: "ev1", uid: "c", answer: "yes" }];

const loaders = ({ event = null, rsvpList = [], survey = null, answered = [], incomplete = [] } = {}) => ({
  event: async (id) => (event && event.id === id ? event : null),
  rsvps: async (eventId) => rsvpList.filter((r) => r.eventId === eventId),
  survey: async (id) => (survey && survey.id === id ? survey : null),
  answeredUids: async () => answered,
  incompleteUids: async () => incomplete,
});

test("audienceOf: targetUids 優先、無ければ areas、どちらも無ければ全員", () => {
  const active = students.slice(0, 4);
  assert.deepEqual(ids(audienceOf({ targetUids: ["c"] }, active)), ["c"]);
  assert.deepEqual(ids(audienceOf({ targetUids: [], areas: ["kanto"] }, active)), []);
  assert.deepEqual(ids(audienceOf(kantoEvent, active)), ["a", "b"]);
  assert.deepEqual(ids(audienceOf({ areas: [] }, active)), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(audienceOf(null, active)), ["a", "b", "c", "d"]);
});

test("eventGroupList: 対象者の中だけで 出席/到着/欠席/未回答 に分ける（対象外の学生は未回答に含めない）", () => {
  const active = students.slice(0, 4);
  assert.deepEqual(ids(eventGroupList(kantoEvent, active, rsvps, "yes")), ["a"]);
  assert.deepEqual(ids(eventGroupList(kantoEvent, active, rsvps, "arrived")), ["a"]);
  assert.deepEqual(ids(eventGroupList(kantoEvent, active, rsvps, "none")), ["b"], "東海のc/dは対象外なので未回答者に入らない");
  assert.deepEqual(ids(eventGroupList(kantoEvent, active, rsvps, "no")), []);
});

test("resolveRecipients: uids が配列なら在籍者の中からその人だけ。空配列なら 400 エラー（全員に落ちない）", async () => {
  const got = await resolveRecipients({ students, target: "全員", uids: ["a", "c", "x", "y", "zzz"], loaders: loaders() });
  assert.deepEqual(ids(got), ["a", "c"]);
  await assert.rejects(
    () => resolveRecipients({ students, target: "全員", uids: [], loaders: loaders() }),
    (e) => e.status === 400,
  );
});

test("resolveRecipients: ステータス別", async () => {
  assert.deepEqual(ids(await resolveRecipients({ students, target: "全員", loaders: loaders() })), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(await resolveRecipients({ students, target: "内定者（承諾前）", loaders: loaders() })), ["a", "c"]);
  assert.deepEqual(ids(await resolveRecipients({ students, target: "内定承諾者", loaders: loaders() })), ["b", "d"]);
  assert.deepEqual(ids(await resolveRecipients({ students, target: "タスク未完了者", loaders: loaders({ incomplete: ["b", "x"] }) })), ["b"]);
});

test("resolveRecipients: イベント別はイベントの対象者（エリア・個別指定）の中で絞る", async () => {
  const L = loaders({ event: kantoEvent, rsvpList: rsvps });
  assert.deepEqual(ids(await resolveRecipients({ students, target: "event:ev1:none", loaders: L })), ["b"]);
  assert.deepEqual(ids(await resolveRecipients({ students, target: "event:ev1:yes", loaders: L })), ["a"]);
  // イベントが見つからなければ 400（全員に落ちない）
  await assert.rejects(() => resolveRecipients({ students, target: "event:nope:none", loaders: L }), (e) => e.status === 400);
});

test("resolveRecipients: アンケート別はアンケートの母集団（イベント参加者）×エリア×個別指定の中で 未回答/回答済み に絞る", async () => {
  // 関東限定アンケート：未回答＝関東のうち未回答（東海の c/d に送らない）
  const kantoSurvey = { id: "sv1", areas: ["kanto"], areaBasis: "either" };
  let L = loaders({ survey: kantoSurvey, answered: ["a"] });
  assert.deepEqual(ids(await resolveRecipients({ students, target: "survey:sv1:unanswered", loaders: L })), ["b"]);
  assert.deepEqual(ids(await resolveRecipients({ students, target: "survey:sv1:answered", loaders: L })), ["a"]);
  // 母集団＝イベント到着者（a のみ）：未回答は a だけ
  const afterEvent = { id: "sv2", audience: { type: "event", eventId: "ev1", group: "arrived" } };
  L = loaders({ survey: afterEvent, event: kantoEvent, rsvpList: rsvps, answered: [] });
  assert.deepEqual(ids(await resolveRecipients({ students, target: "survey:sv2:unanswered", loaders: L })), ["a"]);
  // 個別指定があれば最優先
  const picked = { id: "sv3", targetUids: ["d"], areas: ["kanto"] };
  L = loaders({ survey: picked, answered: [] });
  assert.deepEqual(ids(await resolveRecipients({ students, target: "survey:sv3:unanswered", loaders: L })), ["d"]);
  // アンケートが見つからなければ 400
  await assert.rejects(() => resolveRecipients({ students, target: "survey:nope:unanswered", loaders: loaders() }), (e) => e.status === 400);
});

test("resolveRecipients: 不明な対象は 400 エラー（全員に落ちない）", async () => {
  await assert.rejects(() => resolveRecipients({ students, target: "pick", loaders: loaders() }), (e) => e.status === 400);
  await assert.rejects(() => resolveRecipients({ students, target: "", loaders: loaders() }), (e) => e.status === 400);
  await assert.rejects(() => resolveRecipients({ students, target: undefined, loaders: loaders() }), (e) => e.status === 400);
});
