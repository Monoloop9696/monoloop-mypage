// LINE/メール配信の送信先を決める純粋ロジック（/api/line-broadcast から使う）。
// 管理画面（AdminApp.jsx の targetRecipientList）と同じ基準で絞る。
//   - uids が配列なら「在籍者のうちその人だけ」（空なら送らない＝400）。管理画面は確認モーダルに出した名簿の uid をそのまま渡す
//   - target が文字列なら status / event:<id>:<group> / survey:<id>:<group> / タスク未完了者 で絞る
//   - どれにも当たらなければ 400（以前は「全員」に落ちていたため、絞り込んだつもりが全員に届く事故が起きた）
import { matchesAreas } from "../../src/lib/area.js";

export const isActive = (s) => !!s && !s.deleted && (s.status === "内定" || s.status === "承諾");

const bad = (msg) => {
  const err = new Error(msg);
  err.status = 400;
  return err;
};

// イベント／アンケートの対象者：targetUids（個別指定）があれば最優先、無ければ areas（住所エリア）、どちらも無ければ全員
export const audienceOf = (doc, students) => {
  if (!doc) return students;
  if (Array.isArray(doc.targetUids)) {
    const set = new Set(doc.targetUids.map(String));
    return students.filter((s) => set.has(s.id));
  }
  if (Array.isArray(doc.areas) && doc.areas.length) return students.filter((s) => matchesAreas(s, doc.areas, doc.areaBasis));
  return students;
};

// イベントの対象者の中で、出欠グループ（yes=出席 / arrived=出席かつ到着 / no=欠席 / none=未回答）に該当する学生
export const eventGroupList = (event, students, rsvps, group) => {
  const yes = new Set(), no = new Set(), arrived = new Set();
  (rsvps || []).forEach((r) => {
    if (!r) return;
    if (r.answer === "yes") yes.add(r.uid);
    else if (r.answer === "no") no.add(r.uid);
    if (r.arrived === true) arrived.add(r.uid);
  });
  return audienceOf(event, students).filter((s) => {
    if (group === "yes") return yes.has(s.id);
    if (group === "arrived") return yes.has(s.id) && arrived.has(s.id);
    if (group === "no") return no.has(s.id);
    return !yes.has(s.id) && !no.has(s.id);
  });
};

// loaders: { event(id), rsvps(eventId), survey(id), answeredUids(surveyId), incompleteUids() } いずれも async
export async function resolveRecipients({ students, target, uids, loaders }) {
  const active = (students || []).filter(isActive);

  if (Array.isArray(uids)) {
    if (!uids.length) throw bad("送信先がいません。");
    const set = new Set(uids.map(String));
    const list = active.filter((s) => set.has(s.id));
    if (!list.length) throw bad("送信先がいません（在籍者に該当なし）。");
    return list;
  }

  if (target === "全員") return active;
  if (target === "内定者（承諾前）") return active.filter((s) => s.status === "内定");
  if (target === "内定承諾者") return active.filter((s) => s.status === "承諾");
  if (target === "タスク未完了者") {
    const inc = new Set(await loaders.incompleteUids());
    return active.filter((s) => inc.has(s.id));
  }

  if (typeof target === "string" && target.startsWith("event:")) {
    const [, eventId, group] = target.split(":");
    const ev = await loaders.event(eventId);
    if (!ev) throw bad("配信対象のイベントが見つかりません。");
    return eventGroupList(ev, active, await loaders.rsvps(eventId), group);
  }

  if (typeof target === "string" && target.startsWith("survey:")) {
    const [, surveyId, group] = target.split(":");
    const sv = await loaders.survey(surveyId);
    if (!sv) throw bad("配信対象のアンケートが見つかりません。");
    // 母集団：全員 or 特定イベントの参加グループ（イベントが無ければ全員）
    let pool = active;
    const a = sv.audience;
    if (a && a.type === "event" && a.eventId) {
      const ev = await loaders.event(a.eventId);
      if (ev) pool = eventGroupList(ev, active, await loaders.rsvps(a.eventId), a.group || "arrived");
    }
    // 母集団に対して個別指定／エリアで AND
    pool = audienceOf(sv, pool);
    const answered = new Set(await loaders.answeredUids(surveyId));
    return pool.filter((s) => (group === "answered" ? answered.has(s.id) : !answered.has(s.id)));
  }

  throw bad("配信対象の指定が不正です。");
}
