// 管理画面「ホーム」の純粋ロジック（今日やること・今週の予定）。
// 件数や対象者の集計は画面側（AdminApp）で済ませ、ここでは並び順・文言・色（tone）だけを決める。
import { daysLeft, dueText } from "./studentTasks.js";

// tone: danger=要対応（赤）／warn=期限が近い（橙）／info=お知らせ（青）
// action.type: "tab"=そのタブへ／"line"=配信対象を選んだ状態で LINE配信へ／"follow"=要フォロー一覧を開く
export const buildAdminTodos = ({
  unansweredQ = 0, specialNew = 0, proposalsWaiting = 0,
  events = [], surveys = [], followHigh = 0, lineUnlinked = 0, todayStr,
}) => {
  const head = [];
  if (unansweredQ > 0) head.push({
    key: "qbox", tone: "danger", title: `質問箱に未回答の質問が${unansweredQ}件あります`, sub: "回答すると質問者の公式LINEに通知が届きます",
    action: { label: "回答する", type: "tab", tab: "qbox" },
  });
  if (specialNew > 0) head.push({
    key: "special", tone: "danger", title: `特別選考のエントリーが${specialNew}件 未対応です`, sub: "対応状況を変えるとこの一覧から消えます",
    action: { label: "確認する", type: "tab", tab: "special" },
  });
  if (proposalsWaiting > 0) head.push({
    key: "interview", tone: "danger", title: `面談の希望日時が${proposalsWaiting}名から届いています`, sub: "日時と担当者を選んで確定してください",
    action: { label: "日程を確定する", type: "tab", tab: "meet" },
  });

  // 受付中で未回答が残っているイベント・アンケート（期限が近い順。3日以内は赤）
  const due = [];
  const push = (kind, r) => {
    if (!(r.unanswered > 0)) return;
    const d = dueText(kind === "event" ? (r.deadlineDate || r.dateStr) : r.dueDate, todayStr);
    due.push({
      key: `${kind}:${r.id}`,
      tone: d && d.urgent ? "danger" : "warn",
      title: kind === "event" ? `${r.title}：出欠の未回答が${r.unanswered}名` : `${r.title}：未回答が${r.unanswered}名`,
      sub: `回答 ${r.target - r.unanswered} / ${r.target}名${d ? `・期限 ${d.date}（${d.leftText}）` : "・期限なし"}`,
      left: d ? d.left : Number.POSITIVE_INFINITY,
      action: { label: "未回答者にLINE", type: "line", target: kind === "event" ? `event:${r.id}:none` : `survey:${r.id}:unanswered` },
    });
  };
  events.forEach((e) => push("event", e));
  surveys.forEach((s) => push("survey", s));
  due.sort((a, b) => a.left - b.left);

  const tail = [];
  if (followHigh > 0) tail.push({
    key: "follow", tone: "info", title: `要フォロー「高」の内定者が${followHigh}名います`, sub: "スコアの低下・ログインなし・未回答などから判定しています",
    action: { label: "一覧を見る", type: "follow" },
  });
  if (lineUnlinked > 0) tail.push({
    key: "line", tone: "info", title: `LINE未連携の内定者が${lineUnlinked}名います`, sub: "未連携の方への配信はメールで届きます",
    action: { label: "内定者を見る", type: "tab", tab: "students" },
  });
  return [...head, ...due, ...tail];
};

// 今日から days 日先までの予定（面談・イベント・締切・記事の予約投稿）を日付順に並べる
export const buildUpcoming = ({ bookings = [], events = [], deadlines = [], articles = [], todayStr, days = 7 }) => {
  const out = [];
  const within = (date) => {
    const left = daysLeft(date, todayStr);
    return left != null && left >= 0 && left <= days;
  };
  bookings.forEach((b) => {
    if (!within(b.date)) return;
    out.push({
      kind: "meet", date: b.date, time: b.start || "", title: `面談：${b.name || "（名前なし）"}さん`,
      sub: [b.start && b.end ? `${b.start}〜${b.end}` : b.start || "", b.interviewer ? `担当 ${b.interviewer}` : ""].filter(Boolean).join("・"),
    });
  });
  events.forEach((e) => {
    if (!within(e.dateStr)) return;
    out.push({ kind: "event", date: e.dateStr, time: e.time || "", title: e.title, sub: [e.time, e.place].filter(Boolean).join("・") });
  });
  deadlines.forEach((d) => {
    if (!within(d.date)) return;
    out.push({
      kind: "deadline", date: d.date, time: "99:99", title: `${d.title}の${d.kind === "event" ? "出欠" : "回答"} 締切`,
      sub: d.unanswered > 0 ? `未回答 ${d.unanswered}名` : "全員回答済み",
    });
  });
  articles.forEach((a) => {
    if (!within(a.date)) return;
    out.push({ kind: "article", date: a.date, time: a.time || "", title: "記事の予約投稿", sub: `「${a.title}」${a.time ? ` ${a.time} 公開` : ""}` });
  });
  return out
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((x) => {
      const d = dueText(x.date, todayStr);
      return { ...x, label: d.date, today: d.left === 0 };
    });
};
