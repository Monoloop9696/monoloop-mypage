import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Users, Send, CheckCircle2, ChevronRight, Download, X, Trash2, LogOut, Eye,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { SectionTitle } from "../components/common";
import { StudentInner } from "./StudentApp";
import { BRAND, BRAND_LIGHT, LINE_GREEN, INK, PAPER } from "../theme";
import { downloadCsv } from "../lib/csv";
import { setStudentAccount, lineBroadcast } from "../lib/api";
import {
  listenAllStudents, listenAllEvents, listenAllSurveys, listenTemplates,
  loadJourney, saveJourney, addEvent, updateEvent, deleteEvent, deleteEventCascade,
  addSurvey, deleteSurveyCascade,
  updateStudent, addTemplate, deleteTemplate, loadAllRsvps, loadAllResponses,
  listenCohorts, createCohort, setCohortActive, setCohortPassword,
  listenNotices, addNotice, deleteNotice,
} from "../lib/firestore";

const TEMPLATES = {
  "内定者（承諾前）":
    "【モノループ採用】内定承諾のご回答について\n内定承諾のご回答期限は 7/31（金） です。マイページからご回答をお願いします。\n迷っていることがあれば、このLINEで気軽にご相談ください。",
  "内定承諾者":
    "【ご案内】内定者懇親会（8/7）について\nご承諾ありがとうございます！8/7（金）の内定者懇親会の出欠登録は 7/31 までです。マイページからご登録ください。",
  "タスク未完了者":
    "【リマインド】未完了のタスクがあります\nマイページのホーム画面から、アンケート・出欠登録の状況をご確認ください。",
};

const EMPTY_EV = { title: "", date: "", time: "18:00", place: "", copy: "", deadline: "" };
const EMPTY_SV = { title: "", due: "", time: "約3分", q1: "", opts: "", q2: "", multi: false };

export default function AdminApp() {
  const { signOut } = useAuth();

  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [journeys, setJourneys] = useState({});
  const [rsvps, setRsvps] = useState([]);
  const [responses, setResponses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [notices, setNotices] = useState([]);
  const [banner, setBanner] = useState("");

  const journeysRef = useRef(journeys);
  useEffect(() => { journeysRef.current = journeys; }, [journeys]);

  // 購読（管理者が編集する小規模コレクションは即時反映）
  useEffect(() => {
    const u1 = listenAllStudents(setStudents);
    const u2 = listenAllEvents(setEvents);
    const u3 = listenAllSurveys(setSurveys);
    const u4 = listenTemplates(setSavedTemplates);
    const u5 = listenCohorts(setCohorts);
    const u6 = listenNotices(setNotices);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  // 回答系は読み取り回数を抑えるため getDocs で一度だけ取得（更新ボタンで再取得）
  const refreshAnswers = async () => {
    const [r, a] = await Promise.all([loadAllRsvps(), loadAllResponses()]);
    setRsvps(r);
    setResponses(a);
  };
  useEffect(() => { refreshAnswers(); }, []);

  // cohorts が変わるたびに、全卒年度の Journey を読み込む
  useEffect(() => {
    if (!cohorts.length) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        cohorts.map(async (c) => [c.year, await loadJourney(c.year)])
      );
      if (alive) setJourneys(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [cohorts]);

  return (
    <div className="min-h-screen" style={{ background: "#F4F7F6" }}>
      <div className="max-w-md mx-auto min-h-screen relative">
        <header className="sticky top-0 z-40 px-5 py-3.5 flex items-center justify-between"
          style={{ background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2.5">
            <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
              <circle cx="13" cy="13" r="9" fill="none" stroke={BRAND} strokeWidth="3"
                strokeDasharray="40 17" strokeLinecap="round" transform="rotate(40 13 13)" />
            </svg>
            <div>
              <p className="text-sm font-bold leading-none">モノループ</p>
              <p className="text-xs text-gray-400 leading-none mt-0.5">採用管理コンソール</p>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1 text-xs font-bold text-gray-500" aria-label="ログアウト">
            <LogOut size={14} /> ログアウト
          </button>
        </header>

        {banner && (
          <div className="mx-4 mt-3 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
            {banner}
          </div>
        )}

        <AdminBody
          students={students} events={events} surveys={surveys}
          savedTemplates={savedTemplates} journeys={journeys} setJourneys={setJourneys}
          journeysRef={journeysRef} rsvps={rsvps} responses={responses}
          refreshAnswers={refreshAnswers} cohorts={cohorts} notices={notices}
          setBanner={setBanner}
        />
      </div>
    </div>
  );
}

function AdminBody({
  students, events, surveys, savedTemplates, journeys, setJourneys, journeysRef,
  rsvps, responses, refreshAnswers, cohorts, notices, setBanner,
}) {
  const [tab, setTab] = useState("dash");
  const [selectedYear, setSelectedYear] = useState(null);
  const [preview, setPreview] = useState(false);
  const [showAddCohort, setShowAddCohort] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [newPw, setNewPw] = useState("");
  const [cohortErr, setCohortErr] = useState("");
  const [newNotice, setNewNotice] = useState("");
  const [pwEditing, setPwEditing] = useState(false);
  const [pwDraft, setPwDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // `event:<id>` / `survey:<id>`

  const doDeleteEvent = async (id) => {
    setConfirmDel(null); setExpandedEvent(null);
    try { await deleteEventCascade(id); await refreshAnswers(); }
    catch (ex) { setBanner(`削除に失敗しました：${ex.message}`); }
  };
  const doDeleteSurvey = async (id) => {
    setConfirmDel(null); setExpandedSurvey(null);
    try { await deleteSurveyCascade(id); await refreshAnswers(); }
    catch (ex) { setBanner(`削除に失敗しました：${ex.message}`); }
  };

  const selectYear = (y) => {
    setSelectedYear(y); setExpandedEvent(null); setExpandedSurvey(null); setConfirmDeleteId(null);
    setPwEditing(false);
  };
  const submitNotice = async () => {
    const t = newNotice.trim();
    if (!t) return;
    await addNotice(t);
    setNewNotice("");
  };

  // cohorts 読み込み後、選択年度を初期化／整合
  useEffect(() => {
    if (!cohorts.length) return;
    if (selectedYear == null || !cohorts.some((c) => c.year === selectedYear)) {
      setSelectedYear(cohorts[0].year);
    }
  }, [cohorts, selectedYear]);
  const [target, setTarget] = useState("全員");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(null);
  const [sending, setSending] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [ev, setEv] = useState(EMPTY_EV);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [showTplSave, setShowTplSave] = useState(false);
  const [tplName, setTplName] = useState("");
  const [selectedTpl, setSelectedTpl] = useState("");
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [sv, setSv] = useState(EMPTY_SV);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copiedYear, setCopiedYear] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [detailStudent, setDetailStudent] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [expandedSurvey, setExpandedSurvey] = useState(null);

  // ---- 回答マップ ----
  const rsvpMap = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { m[`${r.eventId}_${r.uid}`] = r.answer; });
    return m;
  }, [rsvps]);
  const respMap = useMemo(() => {
    const m = {};
    responses.forEach((r) => { m[`${r.surveyId}_${r.uid}`] = { q1: r.q1 || [], q2: r.q2 || "" }; });
    return m;
  }, [responses]);

  const rsvpOf = (st, e) => {
    const a = rsvpMap[`${e.id}_${st.id}`];
    return a === "yes" ? "出席" : a === "no" ? "欠席" : "未回答";
  };
  const answeredOf = (st, s) => (respMap[`${s.id}_${st.id}`] ? "回答済" : "未回答");
  const answerOf = (st, s) => respMap[`${s.id}_${st.id}`] || null;

  // ---- 年度スコープ ----
  const yearStudents = students.filter((s) => (s.grad || 2027) === selectedYear);
  const activeStudents = yearStudents.filter((s) => !s.deleted && (s.status === "内定" || s.status === "承諾"));
  const totalActive = activeStudents.length;
  const accepted = activeStudents.filter((s) => s.status === "承諾").length;
  const preAccept = activeStudents.filter((s) => s.status === "内定").length;
  const linked = activeStudents.filter((s) => s.lineUserId).length;
  const declinedPre = yearStudents.filter((s) => s.status === "辞退").length;
  const declinedPost = yearStudents.filter((s) => s.status === "承諾後辞退").length;

  const yearEvents = events
    .filter((e) => (e.grad || 2027) === selectedYear && e.published)
    .sort((a, b) => (a.dateStr || "").localeCompare(b.dateStr || ""));
  const yearDrafts = events.filter((e) => (e.grad || 2027) === selectedYear && !e.published);
  const yearSurveys = surveys.filter((s) => (s.grad || 2027) === selectedYear && s.published !== false);

  // ---- 学生ごとの進捗 ----
  const progressOf = (st) => {
    const total = yearEvents.length + yearSurveys.length + 1;
    let done = 0;
    yearEvents.forEach((e) => { if (rsvpMap[`${e.id}_${st.id}`]) done += 1; });
    yearSurveys.forEach((s) => { if (respMap[`${s.id}_${st.id}`]) done += 1; });
    if (st.address && st.phone) done += 1;
    return { done, total };
  };

  const activeList = activeStudents;
  const retiredList = yearStudents.filter((s) => s.deleted || s.status === "辞退" || s.status === "承諾後辞退");
  const filteredActive = activeList.filter((s) => listFilter === "all" || s.status === listFilter);
  const filteredRetired = retiredList.filter((s) =>
    listFilter === "all" ? true
    : listFilter === "削除済" ? s.deleted
    : s.status === listFilter
  );
  const showActiveSection = ["all", "内定", "承諾"].includes(listFilter);
  const showRetiredSection =
    listFilter === "all" ? retiredList.length > 0 : ["辞退", "承諾後辞退", "削除済"].includes(listFilter);

  const targetCount =
    target === "全員" ? activeStudents.length
    : target === "内定者（承諾前）" ? preAccept
    : target === "内定承諾者" ? accepted
    : activeStudents.filter((s) => { const p = progressOf(s); return p.done < p.total; }).length;

  // ---- アカウント配布 / 卒年度管理 ----
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const copyInvite = (g) => {
    const text = `${g.url}\n初期パスワード：${g.pw}`;
    try { navigator.clipboard.writeText(text); } catch { /* noop */ }
    setCopiedYear(g.year);
    setTimeout(() => setCopiedYear(null), 2000);
  };
  const genPw = () => {
    const yy = String(newYear || "").slice(2) || "xx";
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let s = ""; for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setNewPw(`ml${yy}-${s}`);
  };
  const addCohort = async () => {
    setCohortErr("");
    const y = Number(newYear);
    if (!/^\d{4}$/.test(String(newYear)) || y < 2024 || y > 2100) { setCohortErr("西暦4桁の年度を入力してください。"); return; }
    if (cohorts.some((c) => c.year === y)) { setCohortErr("その卒年度は既に存在します。"); return; }
    if (!newPw.trim()) { setCohortErr("初期パスワードを入力（または自動生成）してください。"); return; }
    try {
      const copyFrom = cohorts.length ? cohorts[cohorts.length - 1].year : null;
      await createCohort(y, newPw.trim(), copyFrom);
      setNewYear(""); setNewPw(""); setShowAddCohort(false);
      setSelectedYear(y);
    } catch (ex) {
      setCohortErr(`作成に失敗しました：${ex.message}`);
    }
  };
  const toggleCohort = (g) => setCohortActive(g.yearNum, !g.active);

  // 学生画面プレビュー用ダミー（実データ＝選択年度のイベント/アンケート/Journey）
  const previewCohort = cohorts.find((c) => c.year === selectedYear);
  const previewStudent = {
    id: "preview", name: "サンプル 学生", grad: selectedYear,
    address: "（プレビュー）東京都〇〇区1-1-1", phone: "090-0000-0000",
    zip: "", emergency: "", lineUserId: null, linkCode: "MN-DEMO",
    joinDate: previewCohort?.joinDate,
  };

  // 年度スイッチャー：新しい3件は横並び、それ以前はプルダウンにまとめる
  const NEWEST_SHOWN = 3;
  const newestCohorts = cohorts.slice(-NEWEST_SHOWN);
  const olderCohorts = cohorts.slice(0, Math.max(0, cohorts.length - NEWEST_SHOWN));
  const olderSelected = olderCohorts.some((c) => c.year === selectedYear);

  // ---- イベント ----
  const resetForm = () => { setEv(EMPTY_EV); setEditingDraftId(null); setShowEventForm(false); };

  const publishEventData = (data) =>
    addEvent({
      title: data.title, dateStr: data.date, time: data.time,
      place: data.place || "未定", deadline: data.deadline || "追ってご案内",
      copy: data.copy || "", grad: selectedYear, published: true,
    });

  const doAddEvent = async () => {
    await publishEventData(ev);
    if (editingDraftId) await deleteEvent(editingDraftId);
    resetForm();
  };
  const saveDraft = async () => {
    if (editingDraftId) {
      await updateEvent(editingDraftId, {
        title: ev.title, dateStr: ev.date, time: ev.time, place: ev.place,
        copy: ev.copy, deadline: ev.deadline, grad: selectedYear, published: false,
      });
    } else {
      await addEvent({
        title: ev.title, dateStr: ev.date, time: ev.time, place: ev.place,
        copy: ev.copy, deadline: ev.deadline, grad: selectedYear, published: false,
      });
    }
    resetForm();
  };
  const editDraft = (dft) => {
    setEv({ title: dft.title, date: dft.dateStr || "", time: dft.time, place: dft.place, copy: dft.copy, deadline: dft.deadline });
    setEditingDraftId(dft.id);
    setShowEventForm(true);
  };
  const publishDraft = async (dft) => {
    await updateEvent(dft.id, { published: true });
  };

  // ---- アンケート ----
  const doAddSurvey = async () => {
    await addSurvey({
      title: sv.title,
      due: sv.due ? `${sv.due} まで` : "期限なし",
      time: sv.time || "約3分",
      q1: sv.q1,
      opts: sv.opts.split(/[、,]/).map((x) => x.trim()).filter(Boolean),
      q2: sv.q2 || "その他・自由記述（任意）",
      multi: sv.multi,
      grad: selectedYear,
      published: true,
    });
    setSv(EMPTY_SV);
    setShowSurveyForm(false);
  };

  // ---- Journey ----
  const yearJourney = journeys[selectedYear] || [];
  const updateJourneyLocal = (id, patch) =>
    setJourneys((prev) => ({
      ...prev,
      [selectedYear]: (prev[selectedYear] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const persistJourney = () => saveJourney(selectedYear, journeysRef.current[selectedYear] || []);
  const setYearJourneyAndSave = (list) => {
    setJourneys((prev) => ({ ...prev, [selectedYear]: list }));
    saveJourney(selectedYear, list);
  };
  // 1ステップを更新して即保存（リンク種別のセレクトなど）
  const updateJourneyAndSave = (id, patch) => {
    const list = (journeys[selectedYear] || []).map((x) => (x.id === id ? { ...x, ...patch } : x));
    setJourneys((prev) => ({ ...prev, [selectedYear]: list }));
    saveJourney(selectedYear, list);
  };
  const linkKindOf = (m) => (!m.link ? "" : /^https?:\/\//.test(m.link) ? "url" : m.link);

  // ---- テンプレ ----
  const tplBody = selectedTpl.startsWith("builtin:")
    ? TEMPLATES[selectedTpl.slice(8)]
    : selectedTpl.startsWith("saved:")
    ? (savedTemplates.find((t) => String(t.id) === selectedTpl.slice(6)) || {}).body || ""
    : "";

  const saveTemplate = async () => {
    const name = tplName.trim() || msg.split("\n")[0].slice(0, 14);
    await addTemplate({ name, body: msg });
    setTplName("");
    setShowTplSave(false);
  };

  // ---- ステータス変更・退会・復元 ----
  const changeStatus = (id, v) => {
    if (v === "辞退" || v === "承諾後辞退") {
      const st = students.find((x) => x.id === id);
      setPendingStatus({ id, name: st ? st.name : "", value: v });
      return;
    }
    updateStudent(id, { status: v });
  };
  const confirmDecline = async () => {
    const { id, value } = pendingStatus;
    setPendingStatus(null);
    try {
      await updateStudent(id, { status: value, deleted: true });
      await setStudentAccount({ uid: id, disabled: true });
    } catch (ex) {
      setBanner(`アカウントの無効化に失敗しました：${ex.message}`);
    }
  };
  const trashDelete = async (id) => {
    setConfirmDeleteId(null);
    try {
      await updateStudent(id, { deleted: true });
      await setStudentAccount({ uid: id, disabled: true });
    } catch (ex) {
      setBanner(`アカウントの無効化に失敗しました：${ex.message}`);
    }
  };
  const restoreStudent = async (s) => {
    const status = s.status === "辞退" ? "内定" : s.status === "承諾後辞退" ? "承諾" : s.status;
    try {
      await updateStudent(s.id, { deleted: false, status });
      await setStudentAccount({ uid: s.id, disabled: false });
    } catch (ex) {
      setBanner(`アカウントの有効化に失敗しました：${ex.message}`);
    }
  };

  // ---- LINE配信 ----
  const send = async () => {
    setSending(true);
    setBanner("");
    try {
      const r = await lineBroadcast({ target, body: msg, grad: selectedYear });
      setSent({ target, count: r.count ?? targetCount, line: r.lineCount, mail: r.mailCount });
      setMsg("");
    } catch (ex) {
      setBanner(`配信に失敗しました：${ex.message}`);
    } finally {
      setSending(false);
    }
  };

  // ---- CSV ----
  const statusLabel = (s) =>
    s.deleted && s.status !== "辞退" && s.status !== "承諾後辞退" ? "アカウント削除済"
    : s.status === "内定" ? "内定（承諾前）"
    : s.status === "承諾" ? "内定承諾済"
    : s.status === "辞退" ? "内定辞退" : "承諾後辞退";

  const exportStudentsCsv = () => {
    const header = ["氏名", "大学", "卒年度", "ステータス", "メール", "電話番号", "郵便番号", "住所", "生年月日", "LINE連携", "タスク進捗"];
    const rows = yearStudents.map((s) => {
      const p = progressOf(s);
      return [s.name, s.univ, `${s.grad || selectedYear}`, statusLabel(s), s.email, s.phone, s.zip, s.address, s.birth, s.lineUserId ? "連携済" : "未連携", `${p.done}/${p.total}`];
    });
    downloadCsv(`内定者一覧_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const exportAttendanceCsv = (e) => {
    const header = ["氏名", "大学", "ステータス", "出欠"];
    const rows = activeStudents.map((st) => [st.name, st.univ, statusLabel(st), rsvpOf(st, e)]);
    downloadCsv(`出欠_${e.title}_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const exportSurveyCsv = (s) => {
    const header = ["氏名", "大学", "回答状況", `Q1:${s.q1}`, `Q2:${s.q2}`];
    const rows = activeStudents.map((st) => {
      const a = answerOf(st, s);
      return [st.name, st.univ, a ? "回答済" : "未回答", a ? (a.q1 || []).join(" / ") : "", a ? a.q2 : ""];
    });
    downloadCsv(`アンケート回答_${s.title}_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const tabs = [
    { key: "dash", label: "概況", icon: BarChart3 },
    { key: "students", label: "内定者", icon: Users },
    { key: "line", label: "LINE配信", icon: Send },
  ];

  return (
    <div className="pb-20">
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            {cohorts.length === 0 && <span className="px-3 py-2 text-xs text-gray-400">卒年度未登録</span>}
            {olderCohorts.length > 0 && (
              <select value={olderSelected ? selectedYear : ""}
                onChange={(e) => { if (e.target.value) selectYear(Number(e.target.value)); }}
                aria-label="過去の卒年度" title="過去の卒年度"
                className="text-xs font-bold rounded-xl border py-2 shrink-0"
                style={{
                  width: 74, paddingLeft: 8, paddingRight: 4,
                  ...(olderSelected
                    ? { borderColor: BRAND, color: "#fff", background: BRAND }
                    : { borderColor: "#E5E7EB", color: "#6B7280", background: "#fff" }),
                }}>
                <option value="">past</option>
                {olderCohorts.map((c) => (
                  <option key={c.year} value={c.year}>{c.year}卒{!c.active ? "（停止）" : ""}</option>
                ))}
              </select>
            )}
            {newestCohorts.length > 0 && (
              <div className="flex-1 min-w-0 flex bg-white border border-gray-200 rounded-xl p-1 gap-0.5 text-sm font-bold">
                {newestCohorts.map((c) => (
                  <button key={c.year} onClick={() => selectYear(c.year)}
                    className="flex-1 min-w-0 py-2 px-2 rounded-lg truncate"
                    style={selectedYear === c.year ? { background: BRAND, color: "#fff" } : { color: c.active ? "#6B7280" : "#B8A0AA" }}>
                    {c.year}卒{!c.active && "（停止）"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setPreview(true)}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-2 rounded-xl border shrink-0"
            style={{ borderColor: "#E5E7EB", color: BRAND, background: "#fff" }}>
            <Eye size={15} /> 学生画面
          </button>
        </div>
      </div>

      {tab === "dash" && (
        <div className="px-4 pt-4 space-y-5">
          <div className="grid grid-cols-3 gap-1.5">
            {[["内定者", totalActive], ["承諾済", accepted], ["LINE連携", linked], ["内定辞退", declinedPre], ["承諾後辞退", declinedPost]].map(([k, v]) => (
              <div key={k} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center">
                <p className="text-xs text-gray-500">{k}</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: BRAND }}>
                  {v}<span className="text-xs font-normal text-gray-400">名</span>
                </p>
              </div>
            ))}
          </div>

          {/* イベント */}
          <div>
            <div className="flex items-center justify-between">
              <SectionTitle>イベント出欠状況</SectionTitle>
              <button onClick={() => (showEventForm ? resetForm() : setShowEventForm(true))}
                className="text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border"
                style={showEventForm ? { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
                {showEventForm ? "閉じる" : "+ イベントを追加"}
              </button>
            </div>

            {showEventForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
                {editingDraftId && <p className="text-xs font-bold" style={{ color: BRAND }}>✎ 下書きを編集中</p>}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">イベント名<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })}
                    placeholder="例）内定者ワークショップ" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">開催日<span className="text-red-500 ml-0.5">*</span></p>
                    <input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">開始時間</p>
                    <input type="time" value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">場所</p>
                  <input value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })}
                    placeholder="例）本社 3F ラウンジ / オンライン" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">ひとこと紹介（学生画面に表示）</p>
                  <input value={ev.copy} onChange={(e) => setEv({ ...ev, copy: e.target.value })}
                    placeholder="例）同期と一緒にアイデアを形に。" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">出欠の回答期限</p>
                  <input value={ev.deadline} onChange={(e) => setEv({ ...ev, deadline: e.target.value })}
                    placeholder="例）11/20 まで" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button disabled={!ev.title} onClick={saveDraft}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 border bg-white" style={{ borderColor: BRAND, color: BRAND }}>
                    下書き保存
                  </button>
                  <button disabled={!ev.title || !ev.date} onClick={doAddEvent}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                    公開する
                  </button>
                </div>
                <p className="text-xs text-gray-400">公開すると学生画面に即時反映されます。下書きは学生には表示されません。</p>
              </div>
            )}

            {yearDrafts.length > 0 && (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 mb-3">
                <p className="text-xs font-bold text-gray-500 mb-1">下書き（{yearDrafts.length}件）</p>
                <div className="divide-y divide-gray-100">
                  {yearDrafts.map((dft) => (
                    <div key={dft.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{dft.title}</p>
                        <p className="text-xs text-gray-400">{dft.dateStr ? `${dft.dateStr} ${dft.time}` : "開催日未定"}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => editDraft(dft)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white">編集</button>
                        <button onClick={() => publishDraft(dft)} disabled={!dft.dateStr} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: BRAND }}>公開</button>
                        <button onClick={() => deleteEvent(dft.id)} className="text-xs font-bold px-2 py-1.5 rounded-lg text-gray-400">削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {yearEvents.map((e) => {
              const list = activeStudents.map((st) => ({ st, r: rsvpOf(st, e) }));
              const yes = list.filter((x) => x.r === "出席").length;
              const open = expandedEvent === e.id;
              return (
                <div key={e.id} className="bg-white border border-gray-200 rounded-xl mb-2 overflow-hidden">
                  <button onClick={() => setExpandedEvent(open ? null : e.id)} className="w-full text-left p-4">
                    <div className="flex justify-between text-sm gap-2">
                      <div className="min-w-0">
                        <p className="font-bold">{e.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{e.date}・{e.place}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">参加 {yes}/{totalActive}</p>
                        <p className="text-xs mt-0.5" style={{ color: BRAND }}>{open ? "閉じる ▲" : "回答者を見る ▼"}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${totalActive ? (yes / totalActive) * 100 : 0}%`, background: BRAND }} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-2.5">
                      {["出席", "欠席", "未回答"].map((k) => {
                        const g = list.filter((x) => x.r === k);
                        return (
                          <div key={k}>
                            <p className="text-xs font-bold text-gray-500 mb-1">{k}（{g.length}名）</p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.length === 0 && <span className="text-xs text-gray-300">なし</span>}
                              {g.map((x) => (
                                <span key={x.st.id} className="text-xs font-bold px-2 py-1 rounded-full"
                                  style={k === "出席" ? { background: BRAND_LIGHT, color: BRAND } : k === "欠席" ? { background: "#F3F4F6", color: "#6B7280" } : { background: "#FFF7E6", color: "#B45309" }}>
                                  {x.st.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <button onClick={() => exportAttendanceCsv(e)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>
                          <Download size={12} /> 出欠をCSV出力
                        </button>
                        {confirmDel === `event:${e.id}` ? (
                          <>
                            <button onClick={() => doDeleteEvent(e.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>削除する（出欠も消去）</button>
                            <button onClick={() => setConfirmDel(null)} className="text-xs font-bold px-2 py-1.5 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDel(`event:${e.id}`)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ color: "#DC2626", borderColor: "#FECACA", background: "#fff" }}>
                            <Trash2 size={12} /> このイベントを削除
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* アンケート */}
          <div>
            <div className="flex items-center justify-between">
              <SectionTitle>アンケート回答率</SectionTitle>
              <button onClick={() => setShowSurveyForm(!showSurveyForm)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border"
                style={showSurveyForm ? { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
                {showSurveyForm ? "閉じる" : "+ アンケートを追加"}
              </button>
            </div>

            {showSurveyForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">アンケート名<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={sv.title} onChange={(e) => setSv({ ...sv, title: e.target.value })}
                    placeholder="例）研修内容についての希望調査" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">回答期限</p>
                    <input value={sv.due} onChange={(e) => setSv({ ...sv, due: e.target.value })}
                      placeholder="例）8/30" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">所要時間の目安</p>
                    <input value={sv.time} onChange={(e) => setSv({ ...sv, time: e.target.value })}
                      placeholder="例）約3分" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">質問1の回答形式</p>
                  <div className="flex gap-2">
                    {[[false, "単一選択（1つだけ）"], [true, "複数選択可"]].map(([v, label]) => (
                      <button key={label} onClick={() => setSv({ ...sv, multi: v })}
                        className="flex-1 py-2 rounded-lg text-xs font-bold border"
                        style={sv.multi === v ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">質問1（選択式）<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={sv.q1} onChange={(e) => setSv({ ...sv, q1: e.target.value })}
                    placeholder="例）参加しやすい研修の時間帯は？" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">選択肢（「、」区切りで入力）<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={sv.opts} onChange={(e) => setSv({ ...sv, opts: e.target.value })}
                    placeholder="例）平日午前、平日午後、土曜" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">質問2（自由記述）</p>
                  <input value={sv.q2} onChange={(e) => setSv({ ...sv, q2: e.target.value })}
                    placeholder="例）研修で扱ってほしいテーマがあれば教えてください" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <button disabled={!sv.title || !sv.q1 || !sv.opts.trim()} onClick={doAddSurvey}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                  アンケートを公開する（学生画面に即時反映）
                </button>
              </div>
            )}

            {yearSurveys.map((s) => {
              const list = activeStudents.map((st) => ({ st, r: answeredOf(st, s) }));
              const done = list.filter((x) => x.r === "回答済").length;
              const open = expandedSurvey === s.id;
              return (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl mb-2 overflow-hidden">
                  <button onClick={() => setExpandedSurvey(open ? null : s.id)} className="w-full text-left p-4">
                    <div className="flex justify-between text-sm gap-2">
                      <p className="font-bold min-w-0">
                        {s.title}
                        {s.multi && <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full align-middle" style={{ background: "#EAF0FB", color: "#3B6BC7" }}>複数選択可</span>}
                      </p>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">{done}/{totalActive} 回答</p>
                        <p className="text-xs mt-0.5" style={{ color: "#5B8DEF" }}>{open ? "閉じる ▲" : "回答者を見る ▼"}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${totalActive ? (done / totalActive) * 100 : 0}%`, background: "#5B8DEF" }} />
                    </div>
                  </button>
                  {open && (() => {
                    const detail = activeStudents.map((st) => ({ st, a: answerOf(st, s) }));
                    const answered = detail.filter((x) => x.a);
                    const unanswered = detail.filter((x) => !x.a);
                    const freeTexts = answered.filter((x) => x.a.q2);
                    return (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2">
                            Q1. {s.q1}<span className="font-normal text-gray-400 ml-1">{s.multi ? "（複数選択可）" : ""}</span>
                          </p>
                          {(s.opts || []).map((o) => {
                            const cnt = answered.filter((x) => (x.a.q1 || []).includes(o)).length;
                            return (
                              <div key={o} className="mb-2">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="text-gray-700">{o}</span>
                                  <span className="text-gray-400">{cnt}名</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${answered.length ? (cnt / answered.length) * 100 : 0}%`, background: "#5B8DEF" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2">Q2. {s.q2}（自由記述）</p>
                          {freeTexts.length === 0 ? (
                            <p className="text-xs text-gray-300">記述回答はまだありません</p>
                          ) : (
                            freeTexts.map((x) => (
                              <div key={x.st.id} className="bg-gray-50 rounded-lg p-3 mb-1.5">
                                <p className="text-xs text-gray-800 leading-relaxed">{x.a.q2}</p>
                                <p className="text-xs text-gray-400 mt-1.5">— {x.st.name}（{x.st.univ}）</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-1">未回答（{unanswered.length}名）</p>
                          <div className="flex flex-wrap gap-1.5">
                            {unanswered.length === 0 && <span className="text-xs text-gray-300">なし</span>}
                            {unanswered.map((x) => (
                              <span key={x.st.id} className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "#FFF7E6", color: "#B45309" }}>{x.st.name}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => exportSurveyCsv(s)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "#5B8DEF" }}>
                            <Download size={12} /> 回答をCSV出力
                          </button>
                          {confirmDel === `survey:${s.id}` ? (
                            <>
                              <button onClick={() => doDeleteSurvey(s.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>削除する（回答も消去）</button>
                              <button onClick={() => setConfirmDel(null)} className="text-xs font-bold px-2 py-1.5 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDel(`survey:${s.id}`)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ color: "#DC2626", borderColor: "#FECACA", background: "#fff" }}>
                              <Trash2 size={12} /> このアンケートを削除
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            <button onClick={refreshAnswers} className="text-xs font-bold text-gray-400 mt-1">回答状況を更新</button>
          </div>

          {/* Journey */}
          <div>
            <SectionTitle>Journey（入社までの道のり）</SectionTitle>
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              {yearJourney.map((m, i) => (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="text-xs font-bold text-gray-400 pt-2.5 w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <input value={m.label} onChange={(e) => updateJourneyLocal(m.id, { label: e.target.value })} onBlur={persistJourney}
                      placeholder="ステップ名" className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold" />
                    <input value={m.desc} onChange={(e) => updateJourneyLocal(m.id, { desc: e.target.value })} onBlur={persistJourney}
                      placeholder="説明（学生画面に表示）" className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" />
                    <div className="flex gap-1.5">
                      <select value={linkKindOf(m)}
                        onChange={(e) => {
                          const v = e.target.value;
                          let link = "";
                          if (v === "url") link = /^https?:\/\//.test(m.link || "") ? m.link : "https://";
                          else if (v) link = v;
                          updateJourneyAndSave(m.id, v === "" ? { link: "", cta: "" } : { link });
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white shrink-0">
                        <option value="">リンクなし</option>
                        <option value="event">イベント</option>
                        <option value="survey">アンケート</option>
                        <option value="line">LINE連携</option>
                        <option value="profile">基本情報</option>
                        <option value="url">外部URL</option>
                      </select>
                      {linkKindOf(m) === "url" && (
                        <input value={m.link} onChange={(e) => updateJourneyLocal(m.id, { link: e.target.value })} onBlur={persistJourney}
                          placeholder="https://..." className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" />
                      )}
                    </div>
                    {m.link && (
                      <input value={m.cta || ""} onChange={(e) => updateJourneyLocal(m.id, { cta: e.target.value })} onBlur={persistJourney}
                        placeholder="リンク文言（例：詳しく見る）" className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" />
                    )}
                  </div>
                  <button onClick={() => setYearJourneyAndSave(yearJourney.filter((x) => x.id !== m.id))}
                    aria-label={`ステップ「${m.label}」を削除`} className="text-gray-300 pt-2 shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button onClick={() => setYearJourneyAndSave([...yearJourney, { id: `j${Date.now()}`, label: "", desc: "", type: "static" }])}
                className="w-full py-2 rounded-lg text-xs font-bold border border-dashed border-gray-300 text-gray-500">
                + ステップを追加
              </button>
              <p className="text-xs text-gray-400">変更は学生画面のホームに即時反映されます。</p>
            </div>
          </div>

          {/* お知らせ */}
          <div>
            <SectionTitle>お知らせ（全学年に表示）</SectionTitle>
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex gap-2">
                <input value={newNotice} onChange={(e) => setNewNotice(e.target.value)}
                  placeholder="例）公式Instagramを更新しました！ぜひチェックしてね"
                  className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm" />
                <button disabled={!newNotice.trim()} onClick={submitNotice}
                  className="text-xs font-bold px-4 rounded-lg text-white disabled:opacity-40 shrink-0" style={{ background: BRAND }}>
                  追加
                </button>
              </div>
              <p className="text-xs text-gray-400">追加すると学生ホームの「お知らせ」に即時表示されます（日付は自動）。SNS更新のお知らせなどにどうぞ。</p>
              {notices.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {notices.map((n) => (
                    <div key={n.id} className="py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">
                          {n.createdAt?.toDate ? `${n.createdAt.toDate().getMonth() + 1}.${n.createdAt.toDate().getDate()}` : "—"}
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words">{n.text}</p>
                      </div>
                      <button onClick={() => deleteNotice(n.id)} aria-label="お知らせを削除" className="text-gray-300 pt-1 shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "students" && (
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <SectionTitle>アカウント配布 / 卒年度</SectionTitle>
            <button onClick={() => { setShowAddCohort(!showAddCohort); setCohortErr(""); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg mb-3 border"
              style={showAddCohort ? { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
              {showAddCohort ? "閉じる" : "+ 卒年度を追加"}
            </button>
          </div>

          {showAddCohort && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">卒年度（西暦4桁）<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={newYear} onChange={(e) => setNewYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric" placeholder="例）2029" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">初期パスワード<span className="text-red-500 ml-0.5">*</span></p>
                  <div className="flex gap-1.5">
                    <input value={newPw} onChange={(e) => setNewPw(e.target.value)}
                      placeholder="配布用パスワード" className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2.5 text-sm" />
                    <button onClick={genPw} className="text-xs font-bold px-2.5 rounded-lg border shrink-0" style={{ borderColor: BRAND, color: BRAND }}>自動生成</button>
                  </div>
                </div>
              </div>
              {cohortErr && <p className="text-xs font-bold" style={{ color: "#DC2626" }}>{cohortErr}</p>}
              <p className="text-xs text-gray-400">追加すると、登録URLの発行・年度スイッチャーへの追加・直近年度のJourney複製が自動で行われます。</p>
              <button onClick={addCohort} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: BRAND }}>
                この卒年度を作成する
              </button>
            </div>
          )}

          {(() => {
            const c = cohorts.find((x) => x.year === selectedYear);
            if (!c) {
              return (
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
                  <p className="text-xs text-gray-400">卒年度が未登録です。「+ 卒年度を追加」から作成してください。</p>
                </div>
              );
            }
            const g = { year: `${c.year}卒`, yearNum: c.year, url: `${origin}/signup/${c.year}`, pw: c.initialPassword || "", active: c.active };
            return (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5" style={{ opacity: g.active ? 1 : 0.85 }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    {g.year} の登録情報
                    {!g.active && <span className="px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 10 }}>受付停止</span>}
                  </p>
                  <button onClick={() => toggleCohort(g)} className="text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0"
                    style={{ borderColor: "#D1D5DB", color: g.active ? "#B45309" : "#059947", background: "#fff" }}>
                    {g.active ? "受付停止" : "受付再開"}
                  </button>
                </div>

                <p className="text-xs font-bold text-gray-500 mt-3">登録用URL</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="flex-1 min-w-0 text-xs text-gray-600 font-mono truncate">{g.url}</p>
                  <button onClick={() => copyInvite(g)} className="text-xs font-bold px-3 py-1.5 rounded-lg border shrink-0"
                    style={copiedYear === g.year ? { borderColor: BRAND, color: BRAND, background: BRAND_LIGHT } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
                    {copiedYear === g.year ? "コピー済" : "コピー"}
                  </button>
                </div>

                <p className="text-xs font-bold text-gray-500 mt-3">初期パスワード</p>
                {!pwEditing ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="flex-1 min-w-0 font-mono font-bold text-sm text-gray-700 break-all">{g.pw || "（未設定）"}</p>
                    <button onClick={() => { setPwDraft(g.pw); setPwEditing(true); }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white shrink-0">変更</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <input value={pwDraft} onChange={(e) => setPwDraft(e.target.value)}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-mono" />
                    <button disabled={!pwDraft.trim()} onClick={async () => { await setCohortPassword(c.year, pwDraft.trim()); setPwEditing(false); }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 shrink-0" style={{ background: BRAND }}>保存</button>
                    <button onClick={() => setPwEditing(false)} className="text-xs text-gray-400 px-1 shrink-0">取消</button>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  この年度の学生には上のURLと初期パスワードを配布してください。他の年度は上部の年度スイッチャーで切り替えると表示されます。受付停止中はURLからの新規登録ができません。パスワードを変更しても、登録時に各自が設定したパスワードには影響しません。
                </p>
              </div>
            );
          })()}

          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-1.5">表示フィルター（ステータス）</p>
            <select value={listFilter} onChange={(e) => setListFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-bold bg-white">
              <option value="all">すべて</option>
              <option value="内定">内定（承諾前）</option>
              <option value="承諾">承諾済</option>
              <option value="辞退">内定辞退</option>
              <option value="承諾後辞退">承諾後辞退</option>
              <option value="削除済">削除済</option>
            </select>
          </div>

          <div className="flex items-center justify-between mb-1">
            <SectionTitle>内定者一覧（{selectedYear - 2000}卒）</SectionTitle>
            <button onClick={exportStudentsCsv} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white mb-3" style={{ background: BRAND }}>
              <Download size={12} /> CSVで一括発行
            </button>
          </div>

          {showActiveSection && (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {filteredActive.length === 0 && <p className="p-4 text-xs text-gray-400">該当する学生がいません</p>}
              {filteredActive.map((s) => {
                const p = progressOf(s);
                return (
                  <div key={s.id} className="p-3 flex items-center justify-between gap-2">
                    <button onClick={() => setDetailStudent(s.id)} className="min-w-0 text-left">
                      <p className="text-sm font-bold flex items-center gap-1">{s.name}<ChevronRight size={13} style={{ color: BRAND }} /></p>
                      <p className="text-xs text-gray-500">{s.univ}・タスク {p.done}/{p.total}</p>
                      <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
                        style={s.lineUserId ? { background: "#E7F9EE", color: "#059947" } : { background: "#F3F4F6", color: "#9CA3AF" }}>
                        {s.lineUserId ? "LINE連携済" : "未連携"}
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {confirmDeleteId === s.id ? (
                        <>
                          <button onClick={() => trashDelete(s.id)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>削除する</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-bold px-2 py-1.5 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                        </>
                      ) : (
                        <>
                          <select value={s.status} onChange={(e) => changeStatus(s.id, e.target.value)} aria-label={`${s.name}のステータス`}
                            className="text-xs font-bold rounded-lg border px-2 py-1.5"
                            style={s.status === "承諾" ? { borderColor: BRAND, background: BRAND_LIGHT, color: BRAND } : s.status === "内定" ? { borderColor: "#F5D08C", background: "#FFF7E6", color: "#B45309" } : { borderColor: "#D1D5DB", background: "#F3F4F6", color: "#6B7280" }}>
                            <option value="内定">内定（承諾前）</option>
                            <option value="承諾">内定承諾済</option>
                            <option value="辞退">内定辞退</option>
                            <option value="承諾後辞退">承諾後辞退</option>
                          </select>
                          <button onClick={() => setConfirmDeleteId(s.id)} aria-label={`${s.name}のアカウントを削除`} className="text-gray-300 p-1"><Trash2 size={15} /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showRetiredSection && (
            <div className="mt-5">
              <SectionTitle>辞退者・削除済み一覧</SectionTitle>
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {filteredRetired.length === 0 && <p className="p-4 text-xs text-gray-400">該当する学生がいません</p>}
                {filteredRetired.map((s) => (
                  <div key={s.id} className="p-3 flex items-center justify-between gap-2" style={{ opacity: 0.65 }}>
                    <button onClick={() => setDetailStudent(s.id)} className="min-w-0 text-left">
                      <p className="text-sm font-bold flex items-center gap-1">{s.name}<ChevronRight size={13} className="text-gray-400" /></p>
                      <p className="text-xs text-gray-500">{s.univ}</p>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold px-2 py-1 rounded-full"
                        style={s.status === "辞退" || s.status === "承諾後辞退" ? { background: "#F3F4F6", color: "#6B7280" } : { background: "#FEE2E2", color: "#B91C1C" }}>
                        {s.status === "辞退" ? "内定辞退" : s.status === "承諾後辞退" ? "承諾後辞退" : "アカウント削除済"}
                      </span>
                      <button onClick={() => restoreStudent(s)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white">復元</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                辞退・削除済みの学生はログイン不可・LINE配信の対象外です。「復元」でアカウントとステータス（辞退→内定、承諾後辞退→承諾）が元に戻ります。
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "line" && (
        <div className="px-4 pt-4 space-y-4">
          <SectionTitle>LINE一括配信</SectionTitle>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">配信対象</p>
              <div className="flex flex-wrap gap-2">
                {["全員", "内定者（承諾前）", "内定承諾者", "タスク未完了者"].map((t) => (
                  <button key={t} onClick={() => setTarget(t)} className="text-xs font-bold px-3 py-2 rounded-full border"
                    style={target === t ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: INK }}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                対象：{targetCount}名（未連携者にはメールで自動送信）。辞退者は配信対象から自動的に除外されます。
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">テンプレート</p>
              <div className="grid grid-cols-2 gap-2 items-start">
                <div className="space-y-2">
                  <select value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-bold bg-white">
                    <option value="">テンプレを選択…</option>
                    <optgroup label="定型テンプレ">
                      <option value="builtin:内定者（承諾前）">内定承諾リマインド（承諾前）</option>
                      <option value="builtin:内定承諾者">懇親会のご案内（承諾者）</option>
                      <option value="builtin:タスク未完了者">タスク未完了リマインド</option>
                    </optgroup>
                    {savedTemplates.length > 0 && (
                      <optgroup label="保存したテンプレ">
                        {savedTemplates.map((t) => (<option key={t.id} value={`saved:${t.id}`}>{t.name}</option>))}
                      </optgroup>
                    )}
                  </select>
                  <button disabled={!tplBody} onClick={() => setMsg(tplBody)}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                    この文面を使う
                  </button>
                  {selectedTpl.startsWith("saved:") && (
                    <button onClick={async () => { await deleteTemplate(selectedTpl.slice(6)); setSelectedTpl(""); }}
                      className="w-full py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-500 bg-white">
                      このテンプレを削除
                    </button>
                  )}
                </div>
                <div className="rounded-lg p-2.5 overflow-y-auto" style={{ background: "#8CABCE", maxHeight: 190, minHeight: 96 }}>
                  <p className="text-white font-bold mb-1.5" style={{ fontSize: 10 }}>受信プレビュー</p>
                  {tplBody ? (
                    <div className="bg-white rounded-xl rounded-tl-sm p-2 text-gray-800 whitespace-pre-wrap shadow" style={{ fontSize: 11, lineHeight: 1.5 }}>{tplBody}</div>
                  ) : (
                    <p className="text-white" style={{ fontSize: 10, opacity: 0.85 }}>テンプレを選ぶと、ここにLINEでの見え方が表示されます</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">メッセージ</p>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4}
                placeholder={"例）【リマインド】内定者懇親会の出欠登録は 7/31 までです。マイページからご回答ください。"}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm" />
              <div className="mt-2">
                {!showTplSave ? (
                  <button disabled={!msg} onClick={() => setShowTplSave(true)} className="text-xs font-bold disabled:opacity-40" style={{ color: BRAND }}>
                    + このメッセージをテンプレとして保存
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="テンプレ名（例：懇親会リマインド）"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs" />
                    <button onClick={saveTemplate} className="text-xs font-bold px-3 py-2 rounded-lg text-white" style={{ background: BRAND }}>保存</button>
                    <button onClick={() => { setShowTplSave(false); setTplName(""); }} className="text-xs text-gray-400 px-1">取消</button>
                  </div>
                )}
              </div>
            </div>
            <button disabled={!msg || sending} onClick={send}
              className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: LINE_GREEN }}>
              <Send size={16} /> {sending ? "送信中…" : "LINEで一括送信"}
            </button>
          </div>

          {sent && (
            <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: BRAND_LIGHT }}>
              <CheckCircle2 size={18} style={{ color: BRAND }} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold" style={{ color: BRAND }}>送信しました</p>
                <p className="text-xs text-gray-600 mt-1">
                  「{sent.target}」宛に配信（{sent.count}名）。
                  {sent.line != null && `LINE ${sent.line}件 / メール ${sent.mail}件。`}
                  配信ログは自動で保存されます。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 詳細モーダル */}
      {detailStudent && (() => {
        const d = students.find((x) => x.id === detailStudent);
        if (!d) return null;
        const p = progressOf(d);
        const rows = [
          ["卒年度", `${d.grad || 2027}年卒`],
          ["ステータス", statusLabel(d)],
          ["大学", d.univ || "-"],
          ["生年月日", d.birth || "-"],
          ["メールアドレス", d.email || "-"],
          ["電話番号", d.phone || "-"],
          ["住所", (d.zip || d.address) ? `〒${d.zip || "-"} ${d.address || ""}` : "-"],
          ["LINE連携", d.lineUserId ? "連携済み" : "未連携"],
          ["タスク進捗", `${p.done}/${p.total} 完了`],
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-6">
            <div className="bg-white rounded-2xl w-full max-w-sm max-h-96 overflow-y-auto">
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">内定者情報</p>
                    <p className="text-lg font-bold mt-0.5">{d.name}</p>
                  </div>
                  <button onClick={() => setDetailStudent(null)} aria-label="閉じる"><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="mt-3 divide-y divide-gray-100">
                  {rows.map(([k, v]) => (
                    <div key={k} className="py-2.5 flex justify-between gap-3 text-sm">
                      <span className="text-xs text-gray-500 pt-0.5 shrink-0">{k}</span>
                      <span className="font-medium text-right break-all">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">住所・生年月日などは学生本人がマイページ登録時に入力した情報です。</p>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-6">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <p className="text-sm font-bold">ステータスの変更</p>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              {pendingStatus.name}さんを「{pendingStatus.value === "辞退" ? "内定辞退" : "承諾後辞退"}」に変更すると、
              <span className="font-bold">アカウントが自動的に削除され、マイページにログインできなくなります。</span>
            </p>
            <p className="text-xs mt-2 leading-relaxed font-bold" style={{ color: BRAND }}>削除後も「辞退者・削除済み一覧」からいつでも復元できます。</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingStatus(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-600 bg-white">キャンセル</button>
              <button onClick={confirmDecline} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#DC2626" }}>変更して削除</button>
            </div>
          </div>
        </div>
      )}

      {/* 学生画面プレビュー（閲覧専用） */}
      {preview && selectedYear && (
        <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: PAPER }}>
          <div className="px-4 py-2.5 flex items-center justify-between shrink-0" style={{ background: "#28191F", color: "#FAF4F2" }}>
            <p className="text-xs font-bold flex items-center gap-1.5">
              <Eye size={13} /> プレビュー中（{selectedYear}卒／学生にはこのように表示されます）
            </p>
            <button onClick={() => setPreview(false)} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#FAF4F2", color: "#28191F" }}>
              終了
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <StudentInner
              student={previewStudent} uid="preview" grad={selectedYear}
              events={yearEvents} surveys={yearSurveys} journey={journeys[selectedYear] || []}
              myRsvps={[]} myResponses={[]} readOnly signOut={() => setPreview(false)}
            />
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex max-w-md mx-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 py-2.5 flex flex-col items-center gap-0.5" style={{ color: active ? BRAND : "#9AA7A2" }}>
              <Icon size={20} />
              <span className="text-xs font-bold">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
