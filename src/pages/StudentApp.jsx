import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Calendar, ClipboardList, MessageCircle, Newspaper,
  ChevronRight, MapPin, Clock, X, Check, LogOut, Bell, Download,
  Menu, HelpCircle, User, Send,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { EdHeader, FullLoader } from "../components/common";
import {
  PAPER, PINK, ROSE, ROSE_DEEP, IVORY, MAUVE, GOLD, HAIR, MUTE, INK, LINE_GREEN,
  studentFontStyle, caps,
} from "../theme";
import {
  listenStudent, listenPublishedEvents, listenPublishedSurveys, listenJourney,
  listenMyRsvps, listenMyResponses, listenNotices, listenPublishedArticles,
  listenArticleImages, setRsvp, markArrived, submitResponse, updateStudent, surveyQuestions,
} from "../lib/firestore";
import { askQuestion, listQuestions } from "../lib/api";
import { matchesAreas } from "../lib/area";
import { downloadDataUrl } from "../lib/image";

const ADD_FRIEND_URL = import.meta.env.VITE_LINE_ADD_FRIEND_URL || "";

// 公式LINE表示名
const LINE_ACCOUNT_NAME = "モノ・ループ 新卒採用公式アカウント";

// ループちゃん：時間帯・誕生日・イベントでポーズと吹き出しを出し分け
// （文言・画像はここを編集すれば変えられます）
const LOOPCHAN = {
  birthday: (name) => ({ img: "/loopchan/loopchan-8.png", msg: `${name}さん、お誕生日おめでとう！🎉 すてきな一年になりますように。` }),
  event: (title) => ({ img: "/loopchan/loopchan-8.png", msg: `今日は「${title}」の日だね！たのしみ〜✨` }),
  morning: { img: "/loopchan/loopchan-5.png", msg: "おはよう！今日もいちにち、いってらっしゃい🌸" },
  noon: { img: "/loopchan/loopchan-1.png", msg: "お腹すいた〜。お昼はなに食べる？" },
  evening: { img: "/loopchan/loopchan-4.png", msg: "おつかれさま！ひと息ついてね。" },
  night: { img: "/loopchan/loopchan-6.png", msg: "今日もおつかれさま。ゆっくり休んでね。" },
  latenight: { img: "/loopchan/loopchan-7.png", msg: "まだ起きてるの？無理せず早めに休もう〜" },
};

function pickLoopChan(student, events) {
  const now = new Date();
  const h = now.getHours();
  // 誕生日（student.birth = "YYYY-MM-DD"）
  if (student.birth && /^\d{4}-\d{2}-\d{2}$/.test(student.birth)) {
    const bm = parseInt(student.birth.slice(5, 7), 10);
    const bd = parseInt(student.birth.slice(8, 10), 10);
    if (bm === now.getMonth() + 1 && bd === now.getDate()) return LOOPCHAN.birthday(student.name || "");
  }
  // イベント当日
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const ev = (events || []).find((e) => e.dateStr === today);
  if (ev) return LOOPCHAN.event(ev.title);
  // 時間帯
  if (h >= 5 && h < 10) return LOOPCHAN.morning;
  if (h >= 10 && h < 14) return LOOPCHAN.noon;
  if (h >= 14 && h < 18) return LOOPCHAN.evening;
  if (h >= 18 && h < 23) return LOOPCHAN.night;
  return LOOPCHAN.latenight;
}

// ホームの日付・時刻表示（毎秒更新）
function HomeClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${wd}）`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return (
    <div className="flex items-baseline gap-2 mt-2">
      <span className="text-sm font-bold" style={{ color: INK }}>{dateStr}</span>
      <span className="en-serif" style={{ fontSize: 18, letterSpacing: "0.04em", color: ROSE }}>{timeStr}</span>
    </div>
  );
}

export default function StudentApp() {
  const { user, signOut } = useAuth();
  const [student, setStudent] = useState(undefined); // undefined=読み込み中, null=無し
  const [events, setEvents] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [journey, setJourney] = useState([]);
  const [myRsvps, setMyRsvps] = useState([]);
  const [myResponses, setMyResponses] = useState([]);

  const uid = user?.uid;

  // まず学生ドキュメントを購読し、grad が分かってから年度別データを購読
  useEffect(() => {
    if (!uid) return;
    return listenStudent(uid, setStudent);
  }, [uid]);

  const grad = student?.grad;

  useEffect(() => {
    if (!uid) return;
    const u1 = listenMyRsvps(uid, setMyRsvps);
    const u2 = listenMyResponses(uid, setMyResponses);
    return () => { u1(); u2(); };
  }, [uid]);

  useEffect(() => {
    if (!grad) return;
    const u1 = listenPublishedEvents(grad, setEvents);
    const u2 = listenPublishedSurveys(grad, setSurveys);
    const u3 = listenJourney(grad, setJourney);
    return () => { u1(); u2(); u3(); };
  }, [grad]);

  if (student === undefined) return <FullLoader />;

  // 学生ドキュメントが無い（管理者アカウント等） → 案内
  if (student === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8" style={{ background: PAPER, ...studentFontStyle }}>
        <div className="text-center">
          <p className="jp-mincho font-bold" style={{ fontSize: 18 }}>アカウント情報が見つかりません</p>
          <p className="text-xs mt-3" style={{ color: MUTE }}>採用担当までお問い合わせください。</p>
          <button onClick={signOut} className="mt-6 text-xs font-bold" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>ログアウト</button>
        </div>
      </div>
    );
  }

  return (
    <StudentInner
      student={student} uid={uid} grad={student.grad || 2027}
      events={events} surveys={surveys} journey={journey}
      myRsvps={myRsvps} myResponses={myResponses} signOut={signOut}
    />
  );
}

export function StudentInner({ student, uid, grad, events, surveys, journey, myRsvps, myResponses, signOut, readOnly = false }) {
  const [tab, setTab] = useState("home");
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qData, setQData] = useState({ mine: [], faq: [] });
  const [qText, setQText] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState("");
  const [svAnswers, setSvAnswers] = useState({});
  const [svPath, setSvPath] = useState([]); // 現在までに進んだセクションid（先頭セクションを除く）
  const [focusEventId, setFocusEventId] = useState(null); // Journeyから開いたイベントへスクロール
  const [celebrate, setCelebrate] = useState(false); // 内定承諾のお祝い演出
  const svScrollRef = useRef(null);
  const [profileForm, setProfileForm] = useState({
    zip: student.zip || "", address: student.address || "",
    phone: student.phone || "", emergency: student.emergency || "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [notices, setNotices] = useState([]);
  const [articles, setArticles] = useState([]);
  const [activeArticle, setActiveArticle] = useState(null);
  const [articleImages, setArticleImages] = useState([]);
  // プレビュー（readOnly）確認用のローカル状態。DBには保存しない
  const [previewRsvp, setPreviewRsvp] = useState({});
  const [previewArrived, setPreviewArrived] = useState({});

  useEffect(() => listenNotices(setNotices), []);
  useEffect(() => listenPublishedArticles(setArticles), []);
  useEffect(() => {
    if (!activeArticle) { setArticleImages([]); return; }
    return listenArticleImages(activeArticle.id, setArticleImages);
  }, [activeArticle]);

  const fmtDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : "";
  };
  const fmtNoticeDate = (n) => {
    const d = n.createdAt?.toDate ? n.createdAt.toDate() : null;
    return d ? `${d.getMonth() + 1}.${d.getDate()}` : "";
  };
  // 自分の卒年度向け or 全学年の記事
  const myArticles = articles.filter((a) => a.grad == null || a.grad === grad);

  const studentName = student.name || "";
  const lineLinked = !!student.lineUserId;
  const linkCode = student.linkCode || "";

  // rsvp/response をイベント・アンケートにマージ
  const rsvpMap = useMemo(() => {
    const m = {};
    myRsvps.forEach((r) => { m[r.eventId] = r.answer; });
    return m;
  }, [myRsvps]);
  const arrivedMap = useMemo(() => {
    const m = {};
    myRsvps.forEach((r) => { if (r.arrived) m[r.eventId] = true; });
    return m;
  }, [myRsvps]);
  const changedMap = useMemo(() => {
    const m = {};
    myRsvps.forEach((r) => { if (r.changedAt) m[r.eventId] = true; });
    return m;
  }, [myRsvps]);
  const responseSet = useMemo(() => new Set(myResponses.map((r) => r.surveyId)), [myResponses]);

  // 到着ボタンの当日判定用（YYYY-MM-DD）
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const myEvents = events
    // 対象者：個別指定(targetUids)があれば優先、無ければ住所エリアで判定
    .filter((e) => readOnly || (Array.isArray(e.targetUids) ? e.targetUids.includes(uid) : matchesAreas(student, e.areas, e.areaBasis)))
    .map((e) => ({
      ...e,
      rsvp: readOnly ? (previewRsvp[e.id] ?? null) : (rsvpMap[e.id] ?? null),
      arrived: readOnly ? !!previewArrived[e.id] : !!arrivedMap[e.id],
      changed: readOnly ? false : !!changedMap[e.id],
    }));
  // 対象者フィルタ：特定イベントの参加者(出席/到着)向けアンケートは、該当する学生にだけ表示
  const inSurveyAudience = (s) => {
    const a = s.audience;
    if (!a || a.type !== "event" || !a.eventId) return true;
    if (readOnly) return true; // プレビューでは全部表示
    const r = myRsvps.find((x) => x.eventId === a.eventId);
    if (!r) return false;
    if (a.group === "arrived") return r.answer === "yes" && r.arrived === true;
    if (a.group === "yes") return r.answer === "yes";
    if (a.group === "no") return r.answer === "no";
    return !r.answer;
  };
  const mySurveys = surveys
    .filter(inSurveyAudience)
    // 対象者：個別指定(targetUids)があれば優先、無ければ住所エリアで判定（イベントと同じ）
    .filter((s) => readOnly || (Array.isArray(s.targetUids) ? s.targetUids.includes(uid) : matchesAreas(student, s.areas, s.areaBasis)))
    .map((s) => ({ ...s, done: responseSet.has(s.id) }));

  const profileDone = !!(student.address && student.phone);
  // 管理者がステータスを「承諾」にすると、学生側の表示が切り替わる
  const accepted = student.status === "承諾";
  const celebrateKey = uid ? `ml_accept_celebrated_${uid}` : "";

  // 承諾後の初回ログインで1度だけお祝いを表示（プレビューでは出さない）
  useEffect(() => {
    if (readOnly || !accepted || !celebrateKey) return;
    try {
      if (localStorage.getItem(celebrateKey)) return;
    } catch { return; }
    setCelebrate(true);
  }, [readOnly, accepted, celebrateKey]);
  const closeCelebrate = () => {
    try { localStorage.setItem(celebrateKey, String(Date.now())); } catch { /* noop */ }
    setCelebrate(false);
  };
  // 紙吹雪の粒（再描画で位置が変わらないように固定）
  const confetti = useMemo(() => {
    const colors = [ROSE, PINK, GOLD, MAUVE, "#FFD9E4"];
    return Array.from({ length: 44 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      dx: `${Math.round((Math.random() - 0.5) * 120)}px`,
      dur: `${(2.6 + Math.random() * 2.2).toFixed(2)}s`,
      delay: `${(Math.random() * 2.4).toFixed(2)}s`,
      rot: `${Math.round(360 + Math.random() * 720)}deg`,
      w: 6 + Math.round(Math.random() * 6),
      h: 9 + Math.round(Math.random() * 8),
      color: colors[i % colors.length],
      round: i % 3 === 0,
    }));
  }, []);

  // Journey から特定イベントを開いたとき、そのカードまでスクロール
  useEffect(() => {
    if (tab !== "event" || !focusEventId) return;
    const t = setTimeout(() => {
      const el = typeof document !== "undefined" ? document.getElementById(`ev-${focusEventId}`) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFocusEventId(null);
    }, 80);
    return () => clearTimeout(t);
  }, [tab, focusEventId]);

  // 質問箱：開いたら読み込み
  const loadQuestions = async () => {
    if (readOnly) return;
    try { const r = await listQuestions(); setQData({ mine: r.mine || [], faq: r.faq || [] }); }
    catch { /* 取得失敗は空のまま */ }
  };
  useEffect(() => { if (tab === "questions" && !readOnly) loadQuestions(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const submitQuestion = async () => {
    const t = qText.trim();
    if (!t) return;
    setQErr(""); setQBusy(true);
    try {
      await askQuestion({ text: t });
      setQText("");
      await loadQuestions();
    } catch (ex) {
      setQErr(ex.message || "送信に失敗しました。");
    } finally { setQBusy(false); }
  };

  const doneCount =
    mySurveys.filter((s) => s.done).length +
    myEvents.filter((e) => e.rsvp !== null).length +
    (profileDone ? 1 : 0);
  const totalCount = mySurveys.length + myEvents.length + 1;

  // ループちゃん（時間帯・誕生日・イベントでポーズ＆吹き出しを出し分け）
  const loop = pickLoopChan(student, myEvents);

  const doRsvp = (id, v) => {
    if (readOnly) {
      // プレビューでは画面上だけ切り替え（保存しない）
      setPreviewRsvp((m) => ({ ...m, [id]: v }));
      if (v === "no") setPreviewArrived((m) => ({ ...m, [id]: false }));
      return;
    }
    const prev = rsvpMap[id] ?? null;
    const changed = prev !== null && prev !== v; // 既回答からの変更
    setRsvp(id, uid, v, changed);
  };
  const doArrive = (id) => {
    if (readOnly) {
      setPreviewArrived((m) => ({ ...m, [id]: true }));
      return;
    }
    markArrived(id, uid);
  };

  const submitSurvey = async () => {
    if (readOnly) return;
    const secs = Array.isArray(activeSurvey.sections) ? activeSurvey.sections : [];
    let payload = svAnswers;
    if (secs.length) {
      // 分岐で通らなかったセクションの回答は保存しない
      const firstId = secs[0].id;
      const visited = new Set([firstId, ...svPath]);
      const keep = new Set(
        surveyQuestions(activeSurvey)
          .filter((q) => visited.has(q.sectionId && secs.some((x) => x.id === q.sectionId) ? q.sectionId : firstId))
          .map((q) => q.id)
      );
      payload = Object.fromEntries(Object.entries(svAnswers).filter(([k]) => keep.has(k)));
    }
    await submitResponse(activeSurvey.id, uid, payload);
    setActiveSurvey(null);
    setSvAnswers({});
    setSvPath([]);
  };

  const saveProfile = async () => {
    if (readOnly) return;
    setSavingProfile(true);
    try {
      await updateStudent(uid, {
        zip: profileForm.zip, address: profileForm.address,
        phone: profileForm.phone, emergency: profileForm.emergency,
      });
      setShowProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  // ジャーニー
  // 特定のイベント/アンケートに紐づくステップは、その対象者にだけ表示する
  const stepRef = (m) => {
    if (!m.refId) return null;
    if (m.link === "event") return { kind: "event", item: myEvents.find((e) => e.id === m.refId) || null };
    if (m.link === "survey") return { kind: "survey", item: mySurveys.find((s) => s.id === m.refId) || null };
    return null;
  };
  const visibleJourney = journey.filter((m) => {
    if (readOnly || !m.refId) return true;
    const r = stepRef(m);
    return !r || !!r.item; // 対象外・未公開・削除済みなら出さない
  });
  // 「イベント/アンケート」の汎用ステップは、1件でも回答済みなら完了扱い
  // （新しいイベントが追加されても Now が前に戻らないようにするため）
  const anyEventDone = myEvents.some((e) => e.rsvp != null);
  const anySurveyDone = mySurveys.some((s) => s.done);
  const stepDone = (m) => {
    // 内定承諾ステップは、管理者が「承諾」にした時点で完了になる
    if (m.type === "accept") return accepted;
    const r = stepRef(m);
    if (r && r.item) return r.kind === "event" ? r.item.rsvp != null : !!r.item.done;
    if (m.link === "event") return anyEventDone;
    if (m.link === "survey") return anySurveyDone;
    if (m.link === "profile") return profileDone;
    return m.type === "profile" ? profileDone
      : m.type === "event" ? anyEventDone
      : false;
  };
  const flags = visibleJourney.map(stepDone);
  const nowIdx = flags.findIndex((x) => !x);
  const milestones = visibleJourney.map((m) => {
    let cta = null, onTap = null, isLink = false;
    if (m.link && !/^https?:\/\/$/i.test(m.link)) {
      // 手入力ステップのリンク（内部タブ or 外部URL）
      isLink = true;
      const L = m.link;
      const ext = /^https?:\/\//.test(L);
      cta = m.cta || (ext ? "リンクを開く"
        : L === "event" ? "イベントを見る" : L === "survey" ? "アンケートへ"
        : L === "line" ? "LINE連携へ" : L === "profile" ? "基本情報を登録" : "詳しく見る");
      const ref = stepRef(m);
      onTap = ext ? () => window.open(L, "_blank", "noopener,noreferrer")
        : (ref && ref.item && ref.kind === "event") ? () => { setTab("event"); setFocusEventId(ref.item.id); }
        : (ref && ref.item && ref.kind === "survey") ? () => {
            if (ref.item.done) { setTab("survey"); return; }
            setActiveSurvey(ref.item); setSvAnswers({}); setSvPath([]);
          }
        : L === "event" ? () => setTab("event")
        : L === "survey" ? () => setTab("survey")
        : L === "line" ? () => setTab("line")
        : L === "profile" ? () => setShowProfile(true)
        : null;
    } else if (m.type === "profile") {
      cta = "登録へ進む"; onTap = () => setShowProfile(true);
    } else if (m.type === "event") {
      cta = "出欠を回答する"; onTap = () => setTab("event");
    }
    // 内定承諾ステップの表示名は status に合わせて自動で切り替える
    const label = m.type === "accept" ? (accepted ? "内定承諾" : "内定") : m.label;
    return { ...m, label, cta, onTap, isLink };
  });

  const statusTag = (e) =>
    e.rsvp === null ? (
      <span className="px-2 py-1" style={{ ...caps(9, GOLD, "0.15em"), border: `1px solid ${GOLD}` }}>出欠未回答</span>
    ) : e.rsvp === "yes" ? (
      <span className="px-2 py-1" style={{ ...caps(9, ROSE, "0.15em"), background: "#F7E2EA" }}>出席</span>
    ) : (
      <span className="px-2 py-1" style={{ ...caps(9, "#9B8A8B", "0.15em"), background: "#EFE6E3" }}>欠席</span>
    );

  const tabs = [
    { key: "home", label: "HOME", icon: Home },
    { key: "event", label: "EVENTS", icon: Calendar },
    { key: "survey", label: "SURVEY", icon: ClipboardList },
    { key: "news", label: "NEWS", icon: Newspaper },
  ];

  const surveyDoneCount = mySurveys.filter((s) => s.done).length;

  // 上部アラート：未対応タスクの集約（受付終了＝期日超過は対象外）
  const pendingEvents = myEvents.filter((e) => e.rsvp === null && !e.closed && !(e.deadlineDate ? e.deadlineDate < todayStr : (e.dateStr && e.dateStr < todayStr))).length;
  const pendingSurveys = mySurveys.filter((s) => !s.done && !(s.dueDate && s.dueDate < todayStr)).length;
  const alerts = [];
  if (pendingEvents) alerts.push({ label: `出欠未回答 ${pendingEvents}件`, onTap: () => setTab("event") });
  if (pendingSurveys) alerts.push({ label: `未回答アンケート ${pendingSurveys}件`, onTap: () => setTab("survey") });
  if (!profileDone) alerts.push({ label: "基本情報が未登録", onTap: () => setShowProfile(true) });
  if (!lineLinked) alerts.push({ label: "LINE未連携", onTap: () => setTab("line") });

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      <div className="max-w-md mx-auto min-h-screen relative">
        {/* ヘッダー */}
        <header className="sticky top-0 z-40 px-5 py-3.5 flex items-center justify-between"
          style={{ background: PAPER, borderBottom: `1px solid ${HAIR}` }}>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="モノ・ループ" className="shrink-0" style={{ height: 22, width: "auto" }} />
            <div>
              <p className="en-serif font-bold leading-none" style={{ fontSize: 15, fontStyle: "italic", color: ROSE }}>Monoloop</p>
              <p className="leading-none mt-1" style={caps(8, MAUVE, "0.2em")}>My Page</p>
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 rounded-full" style={{ color: MUTE }} aria-label="メニュー">
              <Menu size={20} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl shadow-xl overflow-hidden"
                  style={{ border: `1px solid ${HAIR}`, minWidth: 176 }}>
                  {[
                    { label: "質問箱", icon: HelpCircle, onClick: () => setTab("questions") },
                    { label: "LINE連携", icon: MessageCircle, onClick: () => setTab("line") },
                    { label: "プロフィール", icon: User, onClick: () => setShowProfile(true) },
                    { label: "ログアウト", icon: LogOut, onClick: signOut },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.label} onClick={() => { setMenuOpen(false); m.onClick(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                        style={{ color: INK, borderBottom: `1px solid ${HAIR}` }}>
                        <Icon size={15} style={{ color: MUTE }} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </header>

        {/* 上部アラート（未対応タスク） */}
        {accepted && (
          <div className="px-5 py-2 flex items-center gap-2" style={{ background: "#FFF7FA", borderBottom: `1px solid ${HAIR}` }}>
            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: ROSE, color: IVORY }}>内定承諾済</span>
            <span className="text-xs truncate" style={{ color: MUTE }}>ご承諾ありがとうございます。入社まで一緒に準備していきましょう。</span>
          </div>
        )}
        {alerts.length > 0 && (
          <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto"
            style={{ background: "#FFF3E0", borderBottom: `1px solid ${HAIR}` }}>
            <span className="shrink-0 flex items-center gap-1 text-xs font-bold" style={{ color: "#B45309" }} aria-hidden="true">
              <Bell size={13} /> 未対応
            </span>
            {alerts.map((a) => (
              <button key={a.label} onClick={a.onTap} disabled={readOnly}
                className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full disabled:opacity-70"
                style={{ background: "#fff", color: "#B45309", border: "1px solid #F5D08C" }}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="pb-32">
          {/* ホーム */}
          {tab === "home" && (
            <div>
              <section className="relative overflow-hidden ml-in"
                style={{ background: `linear-gradient(165deg, #FCE1EA 0%, ${PINK} 100%)` }}>
                <div className="px-6 pt-8 pb-9 relative">
                  <p style={caps(10, ROSE)}>Monoloop Onboarding — Class of {grad}</p>
                  <h1 className="font-bold mt-3" style={{ fontSize: 20, color: INK }}>こんにちは、{studentName}さん。</h1>
                  <HomeClock />

                  {/* ループちゃん＋吹き出し */}
                  <div className="flex items-end gap-3 mt-5">
                    <img src={loop.img} alt="ループちゃん" className="ml-float shrink-0"
                      style={{ width: 108, height: 108, objectFit: "contain" }} />
                    <div className="flex-1 mb-5">
                      <div className="bg-white px-4 py-3 shadow-sm"
                        style={{ borderRadius: 18, borderBottomLeftRadius: 4 }}>
                        <p className="text-sm font-bold leading-relaxed" style={{ color: ROSE_DEEP }}>{loop.msg}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between items-baseline mb-2">
                      <p style={caps(9, ROSE)}>Onboarding progress</p>
                      <p className="font-bold" style={{ fontSize: 14, color: ROSE }}>
                        {doneCount} <span style={{ opacity: 0.5 }}>/ {totalCount}</span>
                      </p>
                    </div>
                    <div style={{ height: 5, background: "rgba(228,0,127,0.14)", borderRadius: 999 }}>
                      <div style={{ height: 5, width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%`, background: ROSE, borderRadius: 999, transition: "width .6s ease" }} />
                    </div>
                  </div>
                </div>
              </section>

              <div className="px-6 mt-10 space-y-12">
                {/* ジャーニー */}
                <section className="ml-in ml-in-1">
                  <EdHeader en="Journey" jp="入社までの道のり" />
                  <div>
                    {milestones.map((m, i) => {
                      const state = flags[i] ? "done" : i === nowIdx ? "now" : "next";
                      const tappable = !!m.onTap && (m.isLink || state === "now");
                      const inner = (
                        <div className="flex items-start gap-4 py-5"
                          style={{ borderBottom: i < milestones.length - 1 ? `1px solid ${HAIR}` : "none" }}>
                          <span className="en-serif shrink-0" style={{ fontStyle: "italic", fontSize: 22, lineHeight: 1, width: 34,
                            color: state === "done" ? MAUVE : state === "now" ? GOLD : "#D9C4CB" }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className="jp-mincho font-bold" style={{ fontSize: 16, color: state === "next" ? "#A78F98" : INK }}>{m.label}</p>
                              {state === "done" && (
                                <span className="flex items-center gap-1.5" style={caps(9, MAUVE, "0.18em")}><Check size={11} strokeWidth={3} /> Done</span>
                              )}
                              {state === "now" && (
                                <span className="flex items-center gap-1.5" style={caps(9, GOLD, "0.18em")}>
                                  <span className="ml-blink inline-block w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} /> Now
                                </span>
                              )}
                              {state === "next" && <span style={caps(9, "#D3BFC6", "0.18em")}>Coming</span>}
                            </div>
                            <p className="text-xs mt-1.5" style={{ color: state === "next" ? "#B7A2AA" : MUTE }}>{m.desc}</p>
                            {tappable && m.cta && (
                              <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-bold"
                                style={{ color: ROSE, borderBottom: `1px solid ${ROSE}`, paddingBottom: 2 }}>
                                {m.cta}<ChevronRight size={14} />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                      return tappable ? (
                        <button key={m.id} onClick={m.onTap} className="w-full text-left">{inner}</button>
                      ) : (
                        <div key={m.id}>{inner}</div>
                      );
                    })}
                    {milestones.length === 0 && <p className="text-xs" style={{ color: MUTE }}>準備中です。</p>}
                  </div>
                </section>

                {/* 直近のイベント */}
                <section className="ml-in ml-in-2">
                  <EdHeader en="Upcoming" jp="直近のイベント" />
                  {myEvents.length === 0 ? (
                    <p className="text-xs" style={{ color: MUTE }}>現在ご案内中のイベントはありません。</p>
                  ) : (
                    <div className="bg-white" style={{ border: `1px solid ${HAIR}` }}>
                      {myEvents.slice(0, 2).map((e, i) => (
                        <button key={e.id} onClick={() => setTab("event")}
                          className="w-full text-left px-5 py-4 flex items-center gap-4"
                          style={{ borderBottom: i === 0 && myEvents.length > 1 ? `1px solid ${HAIR}` : "none" }}>
                          <span className="en-serif shrink-0" style={{ fontStyle: "italic", fontSize: 19, color: ROSE, width: 62 }}>{e.num}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{e.title}</p>
                            <p className="text-xs mt-0.5 truncate" style={{ color: MUTE }}>{e.copy}</p>
                          </div>
                          {statusTag(e)}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* お知らせ */}
                <section className="ml-in ml-in-3">
                  <EdHeader en="News" jp="お知らせ" />
                  {notices.length === 0 ? (
                    <p className="text-xs" style={{ color: MUTE }}>現在お知らせはありません。</p>
                  ) : (
                    <div>
                      {notices.slice(0, 6).map((n, i, arr) => (
                        <div key={n.id} className="py-4 flex items-baseline gap-4"
                          style={{ borderBottom: i < arr.length - 1 ? `1px solid ${HAIR}` : "none" }}>
                          <span className="en-serif shrink-0" style={{ fontSize: 14, color: MAUVE, width: 40 }}>{fmtNoticeDate(n)}</span>
                          <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* イベント */}
          {tab === "event" && (() => {
            // 受付終了＝管理者が手動終了(closed) or 回答期限(deadlineDate)超過。未設定は開催日を基準にフォールバック
            const isClosed = (e) => e.closed === true || (e.deadlineDate ? e.deadlineDate < todayStr : (e.dateStr && e.dateStr < todayStr));
            const ended = myEvents.filter(isClosed);
            const activeEv = myEvents.filter((e) => !isClosed(e));
            const unanswered = activeEv.filter((e) => e.rsvp === null);
            const answered = activeEv.filter((e) => e.rsvp !== null);

            const EventCard = (e, isEnded) => (
              <article key={e.id} id={`ev-${e.id}`} className="bg-white ml-in" style={{ border: `1px solid ${HAIR}`, opacity: isEnded ? 0.75 : 1 }}>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <p className="en-serif" style={{ fontStyle: "italic", fontSize: 32, lineHeight: 1, color: ROSE }}>
                      {e.num}<span className="ml-2" style={caps(10, MAUVE, "0.2em")}>{e.en}</span>
                    </p>
                    {isEnded
                      ? <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>受付終了</span>
                      : statusTag(e)}
                  </div>
                  <h3 className="jp-mincho font-bold mt-3" style={{ fontSize: 19 }}>{e.title}</h3>
                  {e.copy && <p className="text-xs mt-1.5" style={{ color: MUTE }}>{e.copy}</p>}
                  <div className="mt-4 space-y-1.5 text-xs" style={{ color: MUTE }}>
                    <p className="flex items-center gap-2"><Clock size={12} /> {e.date}</p>
                    <p className="flex items-center gap-2"><MapPin size={12} /> {e.place}</p>
                    <p className="flex items-center gap-2"><ClipboardList size={12} /> 回答期限：{e.deadline}</p>
                  </div>
                  {isEnded ? (
                    <p className="mt-4 text-xs font-bold" style={{ color: MUTE }}>
                      回答受付は終了しました。あなたの回答：{e.rsvp === "yes" ? "出席" : e.rsvp === "no" ? "欠席" : "未回答"}
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2.5 mt-5">
                        <button onClick={() => doRsvp(e.id, "yes")} className="flex-1 py-2.5 text-sm font-bold disabled:opacity-60"
                          style={e.rsvp === "yes" ? { background: ROSE, color: IVORY, border: `1px solid ${ROSE}` } : { background: "#fff", color: ROSE, border: `1px solid ${ROSE}` }}>
                          出席する
                        </button>
                        <button onClick={() => doRsvp(e.id, "no")} className="flex-1 py-2.5 text-sm font-bold disabled:opacity-60"
                          style={e.rsvp === "no" ? { background: "#6E5A62", color: "#fff", border: "1px solid #6E5A62" } : { background: "#fff", color: MUTE, border: `1px solid ${HAIR}` }}>
                          欠席する
                        </button>
                      </div>
                      {e.changed && (
                        <p className="text-xs mt-2" style={{ color: MUTE }}>回答を変更しました。担当者に共有されます。</p>
                      )}
                    </>
                  )}
                  {/* 到着：出席者は開催日以降いつでも押せる（管理者が最終終了するまで）。回答期限とは独立 */}
                  {(() => {
                    if (e.rsvp !== "yes") return null;
                    const canArrive = !e.closed && (readOnly || (e.dateStr && e.dateStr <= todayStr)); // 開催日当日以降
                    const upcoming = !e.closed && e.dateStr && e.dateStr > todayStr; // これから
                    if (!(e.arrived || canArrive || upcoming)) return null;
                    return (
                      <div className="mt-3">
                        {e.arrived ? (
                          <div className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5"
                            style={{ background: "#EAF7EE", color: "#1E874B", border: "1px solid #BFE6CC" }}>
                            <Check size={15} /> 到着を受け付けました
                          </div>
                        ) : canArrive ? (
                          <button onClick={() => doArrive(e.id)}
                            className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                            style={{ background: "#1E874B", color: "#fff", border: "1px solid #1E874B" }}>
                            <MapPin size={15} /> 会場に到着したら押す
                          </button>
                        ) : (
                          <div className="w-full py-2.5 text-xs font-bold text-center"
                            style={{ background: "#F7F3F4", color: MUTE, border: `1px solid ${HAIR}` }}>
                            当日にこちらから到着を受け付けます
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </article>
            );

            return (
              <div className="px-6 pt-8 space-y-8">
                <EdHeader en="Events" jp="イベント" note="出欠のご回答をお願いします" />
                {myEvents.length === 0 && <p className="text-xs" style={{ color: MUTE }}>現在ご案内中のイベントはありません。</p>}
                {unanswered.length > 0 && (
                  <div className="space-y-5">
                    <p className="text-xs font-bold" style={{ color: ROSE }}>未回答（{unanswered.length}）</p>
                    {unanswered.map((e) => EventCard(e, false))}
                  </div>
                )}
                {answered.length > 0 && (
                  <div className="space-y-5">
                    <p className="text-xs font-bold" style={{ color: MAUVE }}>回答済み（{answered.length}）</p>
                    {answered.map((e) => EventCard(e, false))}
                  </div>
                )}
                {ended.length > 0 && (
                  <div className="space-y-5">
                    <p className="text-xs font-bold" style={{ color: MUTE }}>受付終了（{ended.length}）</p>
                    {ended.map((e) => EventCard(e, true))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* アンケート */}
          {tab === "survey" && (() => {
            const isPast = (s) => s.dueDate && s.dueDate < todayStr;
            const ended = mySurveys.filter(isPast);
            const activeSv = mySurveys.filter((s) => !isPast(s));
            const unanswered = activeSv.filter((s) => !s.done);
            const answered = activeSv.filter((s) => s.done);

            const SurveyList = (items, isEnded) => (
              <div className="bg-white ml-in" style={{ border: `1px solid ${HAIR}` }}>
                {items.map((s, i) => (
                  <button key={s.id} disabled={s.done || isEnded}
                    onClick={() => { setActiveSurvey(s); setSvAnswers({}); setSvPath([]); }}
                    className="w-full text-left px-5 py-5 flex items-center gap-4"
                    style={{ borderBottom: i < items.length - 1 ? `1px solid ${HAIR}` : "none", opacity: (s.done || isEnded) ? 0.65 : 1 }}>
                    <span className="en-serif shrink-0" style={{ fontStyle: "italic", fontSize: 20, color: (s.done || isEnded) ? MAUVE : GOLD, width: 30 }}>0{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="jp-mincho font-bold text-sm truncate" style={{ fontSize: 15 }}>{s.title}</p>
                      <p className="text-xs mt-1" style={{ color: MUTE }}>
                        {isEnded ? "受付は終了しました" : s.done ? "ご回答ありがとうございました" : `${s.due || "期限なし"} ・ 所要 ${s.time || "—"}`}
                      </p>
                    </div>
                    {isEnded ? (
                      <span style={caps(9, MUTE, "0.18em")}>Closed</span>
                    ) : s.done ? (
                      <span style={caps(9, MAUVE, "0.18em")}>Answered</span>
                    ) : (
                      <span className="flex items-center gap-1" style={caps(9, GOLD, "0.18em")}>Open <ChevronRight size={12} /></span>
                    )}
                  </button>
                ))}
              </div>
            );

            return (
              <div className="px-6 pt-8">
                <EdHeader en="Survey" jp="アンケート" note={`${surveyDoneCount} / ${mySurveys.length} 回答済み`} />
                {mySurveys.length === 0 ? (
                  <p className="text-xs" style={{ color: MUTE }}>現在ご案内中のアンケートはありません。</p>
                ) : (
                  <>
                    <div className="mb-6" style={{ height: 2, background: "#F0DFE0" }}>
                      <div style={{ height: 2, width: `${mySurveys.length ? (surveyDoneCount / mySurveys.length) * 100 : 0}%`, background: GOLD, transition: "width .6s ease" }} />
                    </div>
                    {unanswered.length > 0 && (<><p className="text-xs font-bold mb-2" style={{ color: GOLD }}>未回答（{unanswered.length}）</p>{SurveyList(unanswered, false)}</>)}
                    {answered.length > 0 && (<><p className="text-xs font-bold mb-2 mt-6" style={{ color: MAUVE }}>回答済み（{answered.length}）</p>{SurveyList(answered, false)}</>)}
                    {ended.length > 0 && (<><p className="text-xs font-bold mb-2 mt-6" style={{ color: MUTE }}>受付終了（{ended.length}）</p>{SurveyList(ended, true)}</>)}
                  </>
                )}
              </div>
            );
          })()}

          {/* NEWS（記事） */}
          {tab === "news" && (
            <div className="px-6 pt-8">
              <EdHeader en="News & Report" jp="NEWS" note="イベントの様子をお届け" />
              {myArticles.length === 0 ? (
                <p className="text-xs" style={{ color: MUTE }}>まだ記事はありません。</p>
              ) : (
                <div className="space-y-4">
                  {myArticles.map((a) => (
                    <button key={a.id} onClick={() => setActiveArticle(a)}
                      className="w-full text-left bg-white ml-in" style={{ border: `1px solid ${HAIR}` }}>
                      {a.thumb && (
                        <img src={a.thumb} alt="" className="w-full" style={{ height: 150, objectFit: "cover" }} />
                      )}
                      <div className="p-4">
                        <p className="en-serif" style={{ fontSize: 12, color: MAUVE }}>{fmtDate(a.createdAt)}</p>
                        <h3 className="jp-mincho font-bold mt-1" style={{ fontSize: 17 }}>{a.title}</h3>
                        {a.body && <p className="text-xs mt-1.5 line-clamp-2" style={{ color: MUTE }}>{a.body}</p>}
                        <span className="inline-flex items-center gap-1 mt-3 text-sm font-bold" style={{ color: ROSE }}>
                          記事を読む <ChevronRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NEWS 記事の詳細（全画面・写真ギャラリー） */}
          {activeArticle && (
            <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: PAPER, ...studentFontStyle }}>
              <div className="max-w-md mx-auto min-h-screen pb-20">
                <div className="sticky top-0 z-10 px-5 py-3 flex items-center justify-between"
                  style={{ background: PAPER, borderBottom: `1px solid ${HAIR}` }}>
                  <p style={caps(9, MAUVE, "0.18em")}>News</p>
                  <button onClick={() => setActiveArticle(null)} aria-label="閉じる" className="flex items-center gap-1 text-xs font-bold" style={{ color: MUTE }}>
                    <X size={16} /> 閉じる
                  </button>
                </div>
                {/* 上：写真（全幅・インスタ風。各写真に保存ボタンを重ねる） */}
                {articleImages.length > 0 && (
                  <div>
                    {articleImages.map((img, i) => (
                      <div key={img.id} className="relative">
                        <img src={img.data} alt={`${activeArticle.title} ${i + 1}`} className="w-full block" />
                        <button onClick={() => downloadDataUrl(img.data, `${activeArticle.title}_${i + 1}.jpg`)}
                          aria-label="この写真を保存"
                          className="absolute bottom-2 right-2 flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full shadow"
                          style={{ background: "rgba(255,255,255,0.92)", color: ROSE }}>
                          <Download size={13} /> 保存
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* 下：文章 */}
                <div className="px-6 pt-5">
                  <p className="en-serif" style={{ fontSize: 12, color: MAUVE }}>{fmtDate(activeArticle.createdAt)}</p>
                  <h1 className="jp-mincho font-bold mt-1" style={{ fontSize: 22, lineHeight: 1.4 }}>{activeArticle.title}</h1>
                  {activeArticle.body && (
                    <p className="text-sm mt-4 leading-relaxed whitespace-pre-wrap">{activeArticle.body}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LINE連携 */}
          {tab === "line" && (
            <div className="px-6 pt-8">
              <EdHeader en="Connect" jp="LINE連携" />
              <div className="bg-white ml-in" style={{ border: `1px solid ${HAIR}` }}>
                <div className="p-6">
                  {lineLinked ? (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ border: `1px solid ${MAUVE}` }}>
                        <Check size={20} style={{ color: ROSE }} />
                      </div>
                      <p className="jp-mincho font-bold mt-4" style={{ fontSize: 17 }}>連携が完了しています</p>
                      <p className="mt-2 font-bold" style={{ fontSize: 13, color: ROSE }}>{LINE_ACCOUNT_NAME}</p>
                      <p className="text-xs mt-4 leading-relaxed" style={{ color: MUTE }}>
                        イベント前日のリマインドや大切なお知らせがLINEに届きます。<br />
                        通知の設定はLINEアプリからいつでも変更できます。
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="jp-mincho font-bold" style={{ fontSize: 17 }}>大切なお知らせを、確実に。</p>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: MUTE }}>
                        公式LINEと連携すると、イベント前日のリマインドや限定のお知らせをLINEで受け取れます。
                      </p>
                      <div className="mt-6 space-y-4">
                        {[`${LINE_ACCOUNT_NAME}を友だち追加`, "トーク画面に下の連携コードを送信"].map((t, i) => (
                          <div key={t} className="flex items-start gap-3">
                            <span className="en-serif shrink-0" style={{ fontStyle: "italic", fontSize: 16, color: GOLD }}>0{i + 1}</span>
                            <p className="text-sm pt-0.5">{t}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 py-3.5 text-center font-mono font-bold"
                        style={{ border: `1px dashed ${MAUVE}`, letterSpacing: "0.4em", color: ROSE, fontSize: 17 }}>
                        {linkCode || "―――"}
                      </div>
                      {ADD_FRIEND_URL ? (
                        <a href={ADD_FRIEND_URL} target="_blank" rel="noopener noreferrer"
                          className="block w-full mt-5 py-3 text-sm font-bold text-white text-center" style={{ background: LINE_GREEN }}>
                          友だち追加する
                        </a>
                      ) : (
                        <p className="text-xs mt-5 text-center" style={{ color: MUTE }}>
                          公式LINEを友だち追加のうえ、上記コードをトークに送信してください。
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 質問箱 */}
          {tab === "questions" && (
            <div className="px-6 pt-8 space-y-6">
              <EdHeader en="Q&A" jp="質問箱" note="採用担当に直接きけます" />
              {readOnly ? (
                <p className="text-xs" style={{ color: MUTE }}>プレビューでは質問箱はご利用いただけません。</p>
              ) : (
                <>
                  <div className="bg-white ml-in p-5" style={{ border: `1px solid ${HAIR}` }}>
                    <p className="jp-mincho font-bold" style={{ fontSize: 15 }}>質問を送る</p>
                    <p className="text-xs mt-1" style={{ color: MUTE }}>内容は採用担当のみが確認します。回答が届くとLINEでお知らせします（連携時）。</p>
                    <textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={3}
                      placeholder="例）内定式の服装について教えてください。"
                      className="w-full mt-3 p-3 text-sm bg-white" style={{ border: `1px solid ${HAIR}` }} />
                    {qErr && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{qErr}</p>}
                    <button disabled={!qText.trim() || qBusy} onClick={submitQuestion}
                      className="w-full mt-2 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                      style={{ background: ROSE, color: IVORY }}>
                      <Send size={15} /> {qBusy ? "送信中…" : "質問を送信"}
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: ROSE }}>あなたの質問（{qData.mine.length}）</p>
                    {qData.mine.length === 0 ? (
                      <p className="text-xs" style={{ color: MUTE }}>まだ質問はありません。</p>
                    ) : (
                      <div className="space-y-3">
                        {qData.mine.map((q) => (
                          <div key={q.id} className="bg-white ml-in p-4" style={{ border: `1px solid ${HAIR}` }}>
                            <p className="text-sm whitespace-pre-wrap">{q.text}</p>
                            {q.answer ? (
                              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
                                <p className="text-xs font-bold mb-1" style={{ color: ROSE }}>採用担当より</p>
                                <p className="text-sm whitespace-pre-wrap" style={{ color: INK }}>{q.answer}</p>
                              </div>
                            ) : (
                              <p className="text-xs mt-2" style={{ color: MUTE }}>回答をお待ちください。</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {qData.faq.length > 0 && (
                    <div>
                      <p className="text-xs font-bold mb-2" style={{ color: MAUVE }}>みんなのQ&A（{qData.faq.length}）</p>
                      <div className="space-y-3">
                        {qData.faq.map((q) => (
                          <div key={q.id} className="bg-white ml-in p-4" style={{ border: `1px solid ${HAIR}` }}>
                            <p className="text-sm font-bold">Q. {q.text}</p>
                            <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: INK }}>A. {q.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 基本情報登録モーダル */}
          {showProfile && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50">
              <div className="w-full max-w-md p-6 max-h-96 overflow-y-auto" style={{ ...studentFontStyle, background: PAPER }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p style={caps(9, GOLD)}>Profile</p>
                    <p className="jp-mincho font-bold mt-1" style={{ fontSize: 18 }}>基本情報の登録</p>
                  </div>
                  <button onClick={() => setShowProfile(false)} aria-label="閉じる"><X size={20} style={{ color: MAUVE }} /></button>
                </div>
                <p className="text-xs mt-2 mb-5" style={{ color: MUTE }}>入社書類の送付・緊急時の連絡に使用します。</p>
                <div className="space-y-4">
                  {[
                    { key: "zip", label: "郵便番号", ph: "330-0854", req: false },
                    { key: "address", label: "住所（書類の送付先）", ph: "埼玉県さいたま市大宮区〇〇 1-2-3", req: true },
                    { key: "phone", label: "電話番号", ph: "090-1234-5678", req: true },
                    { key: "emergency", label: "緊急連絡先（任意）", ph: "続柄・電話番号（例：母 090-xxxx-xxxx）", req: false },
                  ].map((fld) => (
                    <div key={fld.key}>
                      <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>{fld.label}{fld.req && <span style={{ color: GOLD }}> *</span>}</p>
                      <input value={profileForm[fld.key]} onChange={(e) => setProfileForm({ ...profileForm, [fld.key]: e.target.value })}
                        placeholder={fld.ph} className="w-full p-3 text-sm bg-white" style={{ border: `1px solid ${HAIR}` }} />
                    </div>
                  ))}
                </div>
                <button disabled={readOnly || !profileForm.address || !profileForm.phone || savingProfile} onClick={saveProfile}
                  className="w-full mt-6 py-3.5 text-sm font-bold disabled:opacity-40" style={{ background: ROSE, color: IVORY }}>
                  {readOnly ? "プレビュー（保存不可）" : savingProfile ? "保存中…" : "登録する"}
                </button>
              </div>
            </div>
          )}

          {/* 内定承諾のお祝い（承諾後の初回ログインで1度だけ） */}
          {celebrate && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-6"
              style={{ background: "rgba(58,42,48,0.55)" }}>
              {/* 紙吹雪 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                {confetti.map((c) => (
                  <span key={c.id} className="ml-confetti absolute top-0 block"
                    style={{
                      left: `${c.left}%`, width: c.w, height: c.round ? c.w : c.h,
                      background: c.color, borderRadius: c.round ? 999 : 2,
                      "--ml-dx": c.dx, "--ml-dur": c.dur, "--ml-delay": c.delay, "--ml-rot": c.rot,
                    }} />
                ))}
              </div>
              <div className="ml-pop relative w-full max-w-sm text-center px-6 py-8"
                style={{ background: PAPER, border: `1px solid ${HAIR}`, boxShadow: "0 18px 48px rgba(58,42,48,0.28)" }}>
                <p style={caps(9, GOLD)}>Congratulations</p>
                <img src="/loopchan/loopchan-8.png" alt="" className="ml-float mx-auto mt-3"
                  style={{ width: 132, height: "auto" }} />
                <p className="jp-mincho font-bold mt-4" style={{ fontSize: 21, color: ROSE_DEEP }}>内定承諾<br />ありがとうございます！</p>
                <p className="text-sm font-bold mt-3">{student.name} さん</p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: MUTE }}>
                  モノ・ループへようこそ。<br />
                  これから入社までの道のりを、このマイページで一緒に進めていきましょう。
                </p>
                <button onClick={closeCelebrate} className="w-full mt-6 py-3.5 text-sm font-bold"
                  style={{ background: ROSE, color: IVORY }}>
                  はじめる
                </button>
              </div>
            </div>
          )}

          {/* アンケート回答モーダル（動的設問） */}
          {activeSurvey && (() => {
            const qs = surveyQuestions(activeSurvey);
            const toArr = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
            // セクション（無ければ従来どおり1ページ表示）
            const secs = Array.isArray(activeSurvey.sections) ? activeSurvey.sections : [];
            const hasSec = secs.length > 0;
            const firstSecId = hasSec ? secs[0].id : null;
            const secIdOf = (q) => (q.sectionId && secs.some((x) => x.id === q.sectionId) ? q.sectionId : firstSecId);
            const curSecId = hasSec ? (svPath[svPath.length - 1] || firstSecId) : null;
            const curSec = hasSec ? secs.find((x) => x.id === curSecId) : null;
            const pageQs = hasSec ? qs.filter((q) => secIdOf(q) === curSecId) : qs;
            // 次に進む先：このページの単一選択の分岐設定を上から見て最初に一致したもの
            const nextTarget = () => {
              for (const q of pageQs) {
                if (q.type !== "single" || !q.branch) continue;
                const chosen = toArr(svAnswers[q.id])[0];
                const t = chosen ? q.branch[chosen] : null;
                if (t && (t === "end" || secs.some((x) => x.id === t))) return t;
              }
              const i = secs.findIndex((x) => x.id === curSecId);
              return i >= 0 && i + 1 < secs.length ? secs[i + 1].id : "end";
            };
            const isLastPage = !hasSec || nextTarget() === "end";
            const scrollTop = () => { if (svScrollRef.current) svScrollRef.current.scrollTop = 0; };
            const goNext = () => { const t = nextTarget(); if (t !== "end") { setSvPath((p) => [...p, t]); scrollTop(); } };
            const goBack = () => { setSvPath((p) => p.slice(0, -1)); scrollTop(); };
            const setChoice = (q, o) => setSvAnswers((a) => {
              if (q.type === "multi") {
                const cur = toArr(a[q.id]);
                return { ...a, [q.id]: cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o] };
              }
              return { ...a, [q.id]: [o] };
            });
            const setText = (q, val) => setSvAnswers((a) => ({ ...a, [q.id]: val }));
            const valid = pageQs.every((q) => {
              if (q.required === false) return true;
              const v = svAnswers[q.id];
              return q.type === "text" ? !!(v && v.toString().trim()) : toArr(v).length > 0;
            });
            return (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50">
                <div ref={svScrollRef} className="w-full max-w-md p-6 overflow-y-auto" style={{ ...studentFontStyle, background: PAPER, maxHeight: "85vh" }}>
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p style={caps(9, GOLD)}>Survey</p>
                      <p className="jp-mincho font-bold mt-1" style={{ fontSize: 18 }}>{activeSurvey.title}</p>
                      {activeSurvey.desc && <p className="text-xs mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: MUTE }}>{activeSurvey.desc}</p>}
                    </div>
                    <button onClick={() => { setActiveSurvey(null); setSvAnswers({}); setSvPath([]); }} aria-label="閉じる"><X size={20} style={{ color: MAUVE }} /></button>
                  </div>
                  {hasSec && curSec && (curSec.title || curSec.desc) && (
                    <div className="mb-5 pb-4" style={{ borderBottom: `1px solid ${HAIR}` }}>
                      {curSec.title && <p className="jp-mincho font-bold text-sm">{curSec.title}</p>}
                      {curSec.desc && <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-wrap" style={{ color: MUTE }}>{curSec.desc}</p>}
                    </div>
                  )}
                  <div className="space-y-6">
                    {pageQs.map((q) => {
                      const qi = qs.indexOf(q);
                      return (
                      <div key={q.id}>
                        <p className="text-sm font-bold mb-2">
                          Q{qi + 1}. {q.label}
                          {q.type !== "text" && <span className="ml-1.5 text-xs font-normal" style={{ color: MUTE }}>{q.type === "multi" ? "（複数選択可）" : "（1つ選択）"}</span>}
                          {q.required === false && <span className="ml-1.5 text-xs font-normal" style={{ color: MUTE }}>（任意）</span>}
                        </p>
                        {q.type === "text" ? (
                          <textarea value={svAnswers[q.id] || ""} onChange={(e) => setText(q, e.target.value)} rows={3}
                            placeholder="自由にご記入ください" className="w-full p-3 text-sm bg-white" style={{ border: `1px solid ${HAIR}` }} />
                        ) : (
                          <div className="space-y-2">
                            {(q.options || []).map((o) => {
                              const selected = toArr(svAnswers[q.id]).includes(o);
                              return (
                                <button key={o} onClick={() => setChoice(q, o)}
                                  className="w-full text-left px-4 py-3 text-sm bg-white flex items-center gap-2.5"
                                  style={selected ? { border: `1px solid ${ROSE}`, color: ROSE, fontWeight: 700 } : { border: `1px solid ${HAIR}` }}>
                                  <span className="inline-flex items-center justify-center shrink-0"
                                    style={{ width: 16, height: 16, borderRadius: q.type === "multi" ? 3 : 999, border: `1.5px solid ${selected ? ROSE : "#C9BFC3"}`, background: selected ? ROSE : "#fff" }}>
                                    {selected && <Check size={11} color="#fff" strokeWidth={3} />}
                                  </span>
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-6">
                    {hasSec && svPath.length > 0 && (
                      <button onClick={goBack} className="px-5 py-3.5 text-sm font-bold bg-white"
                        style={{ border: `1px solid ${HAIR}`, color: MAUVE }}>戻る</button>
                    )}
                    {isLastPage ? (
                      <button disabled={readOnly || !valid} onClick={submitSurvey}
                        className="flex-1 py-3.5 text-sm font-bold disabled:opacity-40" style={{ background: ROSE, color: IVORY }}>
                        {readOnly ? "プレビュー（送信不可）" : "回答を送信する"}
                      </button>
                    ) : (
                      <button disabled={!valid} onClick={goNext}
                        className="flex-1 py-3.5 text-sm font-bold disabled:opacity-40" style={{ background: ROSE, color: IVORY }}>
                        次へ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 下部ナビ（ダークピル） */}
          <nav className="fixed bottom-4 left-1/2 z-40 w-full max-w-md px-6" style={{ transform: "translateX(-50%)" }}>
            <div className="flex px-2 py-1.5 shadow-xl" style={{ background: "#20141A", borderRadius: 999 }}>
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 py-2 flex flex-col items-center gap-1">
                    <Icon size={17} color={active ? IVORY : "#8E7580"} />
                    <span style={caps(8, active ? IVORY : "#8E7580", "0.16em")}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
