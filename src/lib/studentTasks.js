// 学生ホームの「やること」一覧の純粋ロジック。
// 何が未対応かの判定（受付終了の除外など）は画面側で済ませ、ここでは並び順と期限の文言だけを決める。
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const parse = (s) => {
  const str = String(s || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(Number(str.slice(0, 4)), Number(str.slice(5, 7)) - 1, Number(str.slice(8, 10)));
  return Number.isNaN(d.getTime()) ? null : d;
};

// 期限までの残り日数（今日=0、過ぎていれば負）。日付が不正なら null
export const daysLeft = (dateStr, todayStr) => {
  const a = parse(dateStr);
  const b = parse(todayStr);
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

// 「11/13（金）」「あと8日」。3日以内は urgent（色を強める）
export const dueText = (dateStr, todayStr) => {
  const d = parse(dateStr);
  const left = daysLeft(dateStr, todayStr);
  if (!d || left == null) return null;
  const leftText = left < 0 ? "期限を過ぎています" : left === 0 ? "今日まで" : left === 1 ? "明日まで" : `あと${left}日`;
  return { date: `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`, left, leftText, urgent: left <= 3 };
};

// events / surveys は「未回答かつ受付中」のものだけを渡す。interview は未提出のときだけ { dueDate } を渡す。
// 並び: LINE連携（連絡が届かなくなるため最優先）→ 期限が近い順 → 期限なし
export const buildTasks = ({ lineLinked, profileDone, interview, events = [], surveys = [], todayStr }) => {
  const rest = [];
  events.forEach((e) => rest.push({
    key: `event:${e.id}`, kind: "event", id: e.id, title: `${e.title}の出欠`, note: "",
    due: dueText(e.deadlineDate || e.dateStr, todayStr),
  }));
  surveys.forEach((s) => rest.push({
    key: `survey:${s.id}`, kind: "survey", id: s.id, title: s.title, note: s.time || "",
    due: dueText(s.dueDate, todayStr),
  }));
  if (interview) rest.push({
    key: "interview", kind: "interview", title: "面談の希望日時を登録する", note: "",
    due: dueText(interview.dueDate, todayStr),
  });
  if (!profileDone) rest.push({
    key: "profile", kind: "profile", title: "基本情報を登録する", note: "住所・電話番号（入社書類のお届け先）", due: null,
  });
  const rank = (t) => (t.due ? t.due.left : Number.POSITIVE_INFINITY);
  const sorted = rest.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
  const head = lineLinked ? [] : [{
    key: "line", kind: "line", title: "公式LINEと連携する", note: "イベント前日のお知らせが届きます", due: null,
  }];
  return [...head, ...sorted];
};
