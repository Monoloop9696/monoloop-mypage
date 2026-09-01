import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Users, Send, CheckCircle2, ChevronRight, Download, X, Trash2, LogOut, Eye, Newspaper, ImagePlus, RefreshCw, Search, GripVertical, HelpCircle,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { SectionTitle } from "../components/common";
import { StudentInner } from "./StudentApp";
import { BRAND, BRAND_LIGHT, LINE_GREEN, INK, PAPER } from "../theme";
import { downloadCsv } from "../lib/csv";
import { AREAS, areaLabel, matchesAreas, addressArea } from "../lib/area";
import { fileToCompressedDataURL, dataUrlToThumb } from "../lib/image";
import { setStudentAccount, lineBroadcast, listQuestions, answerQuestion, deleteBroadcast, getLineQuota } from "../lib/api";
import {
  listenAllStudents, listenAllEvents, listenAllSurveys, listenTemplates,
  loadJourney, saveJourney, addEvent, updateEvent, deleteEvent, deleteEventCascade,
  addSurvey, updateSurvey, deleteSurveyCascade, surveyQuestions, responseAnswers,
  addSurveyTemplate, deleteSurveyTemplate,
  updateStudent, addTemplate, updateTemplate, deleteTemplate, loadAllRsvps, loadAllResponses, markRsvpChangeSeen, setRsvpArrived, adminSetRsvp, deleteRsvp, loadBroadcasts,
  addTemplateCategory, updateTemplateCategory, deleteTemplateCategory,
  listenCohorts, createCohort, setCohortActive, setCohortPassword,
  listenNotices, addNotice, deleteNotice,
  listenAllArticles, addArticle, updateArticle, addArticleImage, deleteArticleCascade,
  loadArticleImages, deleteArticleImage,
} from "../lib/firestore";

const EMPTY_EV = { title: "", date: "", time: "18:00", place: "", copy: "", deadlineDate: "", areas: [], areaBasis: "either", targetUids: null };
const deadlineLabel = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} まで` : "追ってご案内");
const EMPTY_SV = { title: "", desc: "", dueDate: "", time: "約3分", questions: [], audType: "all", audEventId: "", audGroup: "arrived" };
const newQuestion = (type = "single") => ({
  id: `q_${Math.random().toString(36).slice(2, 9)}`,
  type,
  label: "",
  options: type === "text" ? [] : ["", ""],
  required: true,
});

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
            <img src="/logo.png" alt="モノ・ループ" className="shrink-0" style={{ height: 22, width: "auto" }} />
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

  // ---- NEWS記事 ----
  const [articles, setArticles] = useState([]);
  const [artTitle, setArtTitle] = useState("");
  const [artBody, setArtBody] = useState("");
  const [artGrad, setArtGrad] = useState(""); // "" = 全学年
  const [artImages, setArtImages] = useState([]); // 圧縮済み dataURL 配列
  const [artBusy, setArtBusy] = useState(false);
  const [artErr, setArtErr] = useState("");
  const [artDelId, setArtDelId] = useState(null);
  const [editingArticleId, setEditingArticleId] = useState(null); // null=新規投稿モード
  const [artNotify, setArtNotify] = useState(true); // 投稿時に対象者の公式LINEへ通知
  useEffect(() => listenAllArticles(setArticles), []);

  // ---- 質問箱（API経由で取得・更新） ----
  const [questions, setQuestions] = useState([]);
  const loadQuestions = async () => {
    try { const r = await listQuestions(); setQuestions(r.all || []); }
    catch (ex) { setBanner(`質問の取得に失敗しました：${ex.message}`); }
  };
  useEffect(() => { loadQuestions(); }, []);
  const unansweredQ = questions.filter((q) => !q.answer).length;

  // ---- 配信履歴 ----
  const [broadcasts, setBroadcasts] = useState([]);
  const [expandedBc, setExpandedBc] = useState(null); // 展開中の配信id
  const [bcLimit, setBcLimit] = useState(10); // 表示件数
  const refreshBroadcasts = async () => {
    try { setBroadcasts(await loadBroadcasts()); }
    catch (ex) { setBanner(`配信履歴の取得に失敗しました：${ex.message}`); }
  };
  const removeBroadcast = async (id) => {
    setConfirmDel(null);
    try { await deleteBroadcast(id); await refreshBroadcasts(); }
    catch (ex) { setBanner(`配信履歴の削除に失敗しました：${ex.message}`); }
  };
  // 今月のLINE送信数（無料枠200/月・毎月リセット）
  const [quota, setQuota] = useState(null);
  const refreshQuota = async () => { try { setQuota(await getLineQuota()); } catch { /* 取得失敗は表示なし */ } };
  useEffect(() => { if (tab === "line") { refreshBroadcasts(); refreshQuota(); setBcLimit(10); setExpandedBc(null); } }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setArtErr("");
    setArtBusy(true);
    try {
      const out = [];
      for (const f of files) out.push(await fileToCompressedDataURL(f));
      setArtImages((prev) => [...prev, ...out].slice(0, 20));
    } catch (ex) {
      setArtErr(ex.message);
    } finally {
      setArtBusy(false);
    }
  };
  const removeArtImage = (i) => setArtImages((prev) => prev.filter((_, idx) => idx !== i));
  const resetArtForm = () => {
    setArtTitle(""); setArtBody(""); setArtGrad(""); setArtImages([]); setEditingArticleId(null);
  };
  // 記事投稿時に対象者の公式LINEへお知らせ（LINEのみ・メールは送らない）
  const notifyArticleLine = async (title, grad) => {
    const body = `【新着記事】${title}\nマイページのNEWSでご覧いただけます。`;
    const years = grad ? [grad] : cohorts.map((c) => c.year);
    for (const y of years) {
      try { await lineBroadcast({ target: "全員", targetLabel: `記事「${title}」`, body, grad: y, lineOnly: true }); }
      catch { /* 通知失敗でも投稿自体は成功させる */ }
    }
  };
  const submitArticle = async () => {
    if (!artTitle.trim()) { setArtErr("タイトルを入力してください。"); return; }
    setArtErr("");
    setArtBusy(true);
    try {
      const grad = artGrad ? Number(artGrad) : null;
      const title = artTitle.trim();
      if (editingArticleId) {
        // 更新：本文等を更新し、画像は一旦全削除して現在の内容で再登録
        const id = editingArticleId;
        await updateArticle(id, { title, body: artBody, grad });
        const existing = await loadArticleImages(id);
        for (const im of existing) await deleteArticleImage(id, im.id);
        for (let i = 0; i < artImages.length; i++) await addArticleImage(id, artImages[i], i);
        const thumb = artImages[0] ? await dataUrlToThumb(artImages[0]) : null;
        await updateArticle(id, { thumb: thumb || null });
      } else {
        const id = await addArticle({ title, body: artBody, grad, published: true });
        for (let i = 0; i < artImages.length; i++) await addArticleImage(id, artImages[i], i);
        if (artImages[0]) {
          const thumb = await dataUrlToThumb(artImages[0]);
          if (thumb) await updateArticle(id, { thumb });
        }
        if (artNotify) await notifyArticleLine(title, grad);
      }
      resetArtForm();
    } catch (ex) {
      setArtErr(`${editingArticleId ? "更新" : "投稿"}に失敗しました：${ex.message}`);
    } finally {
      setArtBusy(false);
    }
  };
  const startEditArticle = async (a) => {
    setArtErr("");
    setEditingArticleId(a.id);
    setArtTitle(a.title || "");
    setArtBody(a.body || "");
    setArtGrad(a.grad ? String(a.grad) : "");
    setArtImages([]);
    setArtBusy(true);
    try { const imgs = await loadArticleImages(a.id); setArtImages(imgs.map((im) => im.data)); }
    catch { /* 画像読み込み失敗は空のまま */ }
    finally { setArtBusy(false); }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const doDeleteArticle = async (id) => {
    setArtDelId(null);
    try {
      await deleteArticleCascade(id);
      if (editingArticleId === id) resetArtForm();
    } catch (ex) { setBanner(`削除に失敗しました：${ex.message}`); }
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
  const [tplSaveCat, setTplSaveCat] = useState("");
  const [selectedTpl, setSelectedTpl] = useState("");
  const [showTplManager, setShowTplManager] = useState(false);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [sv, setSv] = useState(EMPTY_SV);
  const [editingSurveyId, setEditingSurveyId] = useState(null); // 下書き/公開済みの編集
  const [svTplName, setSvTplName] = useState("");
  const [svShowTplSave, setSvShowTplSave] = useState(false);
  const [selectedSvTpl, setSelectedSvTpl] = useState("");
  const [historyPicker, setHistoryPicker] = useState(null); // null | "event" | "survey"
  const [historyExpanded, setHistoryExpanded] = useState(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [optionVoters, setOptionVoters] = useState(null); // {qLabel, option, list:[student]} 選択肢の回答者モーダル
  const [attendEdit, setAttendEdit] = useState(null); // {e, st} 出欠編集モーダル
  const [attendAns, setAttendAns] = useState("出席");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copiedYear, setCopiedYear] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [detailStudent, setDetailStudent] = useState(null);
  const [editDetail, setEditDetail] = useState(false);
  // 学生を開き直すたびに編集モードは解除（開いた直後は必ず閲覧表示）
  useEffect(() => { setEditDetail(false); }, [detailStudent]);
  const [listFilter, setListFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [expandedSurvey, setExpandedSurvey] = useState(null);

  // ---- 回答マップ ----
  const rsvpMap = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { m[`${r.eventId}_${r.uid}`] = r.answer; });
    return m;
  }, [rsvps]);
  const arrivedMap = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { if (r.arrived) m[`${r.eventId}_${r.uid}`] = true; });
    return m;
  }, [rsvps]);
  const changedMap = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { if (r.changedAt && !r.changeSeen) m[`${r.eventId}_${r.uid}`] = true; });
    return m;
  }, [rsvps]);
  const cancelReasonMap = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { if (r.cancelReason) m[`${r.eventId}_${r.uid}`] = r.cancelReason; });
    return m;
  }, [rsvps]);
  const respMap = useMemo(() => {
    const m = {};
    responses.forEach((r) => { m[`${r.surveyId}_${r.uid}`] = responseAnswers(r); });
    return m;
  }, [responses]);

  const arrivedOf = (st, e) => !!arrivedMap[`${e.id}_${st.id}`];
  const reasonOf = (st, e) => cancelReasonMap[`${e.id}_${st.id}`] || "";
  const changedOf = (st, e) => !!changedMap[`${e.id}_${st.id}`];
  const ackEventChanges = async (e) => {
    const targets = activeStudents.filter((st) => changedOf(st, e));
    try {
      await Promise.all(targets.map((st) => markRsvpChangeSeen(e.id, st.id)));
      await refreshAnswers();
    } catch (ex) { setBanner(`確認処理に失敗しました：${ex.message}`); }
  };
  // 管理者が学生の到着を切替（押し忘れ対応）
  const toggleArrival = async (e, st) => {
    try {
      await setRsvpArrived(e.id, st.id, !arrivedOf(st, e));
      await refreshAnswers();
    } catch (ex) { setBanner(`到着状態の更新に失敗しました：${ex.message}`); }
  };
  // 管理者が学生の出欠を変更（当日欠席の反映など）。ans: 出席/欠席/未回答。欠席時は理由も保存
  const setAdminRsvp = async (e, st, ans, reason = "") => {
    try {
      if (ans === "未回答") await deleteRsvp(e.id, st.id);
      else await adminSetRsvp(e.id, st.id, ans === "出席" ? "yes" : "no", reason);
      await refreshAnswers();
    } catch (ex) { setBanner(`出欠の更新に失敗しました：${ex.message}`); }
  };
  const rsvpOf = (st, e) => {
    const a = rsvpMap[`${e.id}_${st.id}`];
    return a === "yes" ? "出席" : a === "no" ? "欠席" : "未回答";
  };
  const answeredOf = (st, s) => (respMap[`${s.id}_${st.id}`] ? "回答済" : "未回答");
  const answerOf = (st, s) => respMap[`${s.id}_${st.id}`] || null;

  // ---- 年度スコープ ----
  // 常にあいうえお順。フリガナ(kana)があればそれで、無ければ氏名で照合。ここを起点に一覧・出欠グループ・CSVも同順
  const yearStudents = students
    .filter((s) => (s.grad || 2027) === selectedYear)
    .sort((a, b) => (a.kana || a.name || "").localeCompare(b.kana || b.name || "", "ja"));
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
  const yearSurveyDrafts = surveys.filter((s) => (s.grad || 2027) === selectedYear && s.published === false);

  // ---- 学生ごとの進捗 ----
  const progressOf = (st) => {
    const total = yearEvents.length + yearSurveys.length + 1;
    let done = 0;
    yearEvents.forEach((e) => { if (rsvpMap[`${e.id}_${st.id}`]) done += 1; });
    yearSurveys.forEach((s) => { if (respMap[`${s.id}_${st.id}`]) done += 1; });
    if (st.address && st.phone) done += 1;
    return { done, total };
  };

  // 検索（名前・大学・住所・メール・電話・郵便番号・生年月日を横断）
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (s) =>
    !q || [s.name, s.univ, s.address, s.email, s.phone, s.zip, s.birth]
      .some((v) => (v || "").toString().toLowerCase().includes(q));

  const activeList = activeStudents;
  const retiredList = yearStudents.filter((s) => s.deleted || s.status === "辞退" || s.status === "承諾後辞退");
  const testList = yearStudents.filter((s) => !s.deleted && s.status === "テスト");
  const filteredActive = activeList.filter((s) => (listFilter === "all" || s.status === listFilter) && matchesSearch(s));
  const filteredRetired = retiredList.filter((s) =>
    matchesSearch(s) && (
      listFilter === "all" ? true
      : listFilter === "削除済" ? s.deleted
      : s.status === listFilter
    )
  );
  const filteredTest = testList.filter(matchesSearch);
  const showActiveSection = ["all", "内定", "承諾"].includes(listFilter);
  const showTestSection = listFilter === "all" ? testList.length > 0 : listFilter === "テスト";
  const showRetiredSection =
    listFilter === "all" ? retiredList.length > 0 : ["辞退", "承諾後辞退", "削除済"].includes(listFilter);

  // 配信対象。イベント別は "event:<eventId>:<group>"（group = yes/no/none）で表現
  const isEventTarget = target.startsWith("event:");
  const [, tEventId, tGroup] = isEventTarget ? target.split(":") : [];
  const targetEvent = isEventTarget ? yearEvents.find((e) => e.id === tEventId) : null;
  const groupLabelOf = (g) => (g === "yes" ? "出席者" : g === "arrived" ? "到着者（当日来場）" : g === "no" ? "欠席者" : "未回答者");
  // イベント×グループ に該当するか（arrived=出席かつ到着ボタン押下）
  const inEventGroup = (st, e, g) => {
    const r = rsvpOf(st, e);
    if (g === "yes") return r === "出席";
    if (g === "arrived") return r === "出席" && arrivedOf(st, e);
    if (g === "no") return r === "欠席";
    return r === "未回答";
  };
  // アンケートの対象者（全員 or 特定イベントの参加者）
  const surveyAudience = (s) => {
    const a = s && s.audience;
    if (!a || a.type !== "event" || !a.eventId) return activeStudents;
    const e = events.find((x) => x.id === a.eventId);
    if (!e) return activeStudents;
    return activeStudents.filter((st) => inEventGroup(st, e, a.group || "arrived"));
  };
  const audienceLabel = (s) => {
    const a = s && s.audience;
    if (!a || a.type !== "event" || !a.eventId) return "全員";
    const e = events.find((x) => x.id === a.eventId);
    return `${e ? e.title : "イベント"}・${groupLabelOf(a.group || "arrived")}`;
  };
  // イベントの対象者：明示リスト(targetUids)があれば最優先、無ければエリア指定、どちらも無ければ全員
  const eventAudience = (e) => {
    if (Array.isArray(e.targetUids)) return activeStudents.filter((st) => e.targetUids.includes(st.id));
    return (e.areas && e.areas.length) ? activeStudents.filter((st) => matchesAreas(st, e.areas, e.areaBasis)) : activeStudents;
  };
  const eventAreaText = (e) => {
    if (Array.isArray(e.targetUids)) return `個別選択 ${e.targetUids.length}名`;
    if (!e.areas || !e.areas.length) return null;
    const b = e.areaBasis === "current" ? "現住所" : e.areaBasis === "home" ? "実家" : "どちらも";
    return `${e.areas.map(areaLabel).join("・")}（${b}）`;
  };

  const targetCount = isEventTarget
    ? (targetEvent ? activeStudents.filter((s) => inEventGroup(s, targetEvent, tGroup)).length : 0)
    : target === "全員" ? activeStudents.length
    : target === "内定者（承諾前）" ? preAccept
    : target === "内定承諾者" ? accepted
    : activeStudents.filter((s) => { const p = progressOf(s); return p.done < p.total; }).length;

  const targetLabel = isEventTarget
    ? `${targetEvent ? targetEvent.title : "イベント"}・${groupLabelOf(tGroup)}`
    : target;

  // この配信で使うLINE送信数（＝連携済みの宛先数）。無料枠の消費見込み
  const targetRecipientList = (() => {
    if (isEventTarget) {
      if (!targetEvent) return [];
      return activeStudents.filter((s) => inEventGroup(s, targetEvent, tGroup));
    }
    if (target === "内定者（承諾前）") return activeStudents.filter((s) => s.status === "内定");
    if (target === "内定承諾者") return activeStudents.filter((s) => s.status === "承諾");
    if (target === "タスク未完了者") return activeStudents.filter((s) => { const p = progressOf(s); return p.done < p.total; });
    return activeStudents; // 全員
  })();
  const lineTargetCount = targetRecipientList.filter((s) => s.lineUserId).length;
  const overQuota = quota && quota.remaining != null && lineTargetCount > quota.remaining;

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
      place: data.place || "未定",
      deadlineDate: data.deadlineDate || null,
      deadline: deadlineLabel(data.deadlineDate),
      areas: data.areas || [], areaBasis: data.areaBasis || "either",
      targetUids: Array.isArray(data.targetUids) ? data.targetUids : null,
      copy: data.copy || "", grad: selectedYear, published: true,
    });

  const doAddEvent = async () => {
    await publishEventData(ev);
    if (editingDraftId) await deleteEvent(editingDraftId);
    resetForm();
  };
  const saveDraft = async () => {
    const base = {
      title: ev.title, dateStr: ev.date, time: ev.time, place: ev.place,
      copy: ev.copy, deadlineDate: ev.deadlineDate || null, deadline: deadlineLabel(ev.deadlineDate),
      areas: ev.areas || [], areaBasis: ev.areaBasis || "either",
      targetUids: Array.isArray(ev.targetUids) ? ev.targetUids : null,
      grad: selectedYear, published: false,
    };
    if (editingDraftId) await updateEvent(editingDraftId, base);
    else await addEvent(base);
    resetForm();
  };
  const editDraft = (dft) => {
    setEv({ title: dft.title, date: dft.dateStr || "", time: dft.time, place: dft.place, copy: dft.copy, deadlineDate: dft.deadlineDate || "", areas: dft.areas || [], areaBasis: dft.areaBasis || "either", targetUids: Array.isArray(dft.targetUids) ? dft.targetUids : null });
    setEditingDraftId(dft.id);
    setShowEventForm(true);
  };
  const publishDraft = async (dft) => {
    await updateEvent(dft.id, { published: true });
  };
  // 対象者モーダル用（作成中イベントの対象者を個別に表示/非表示）
  const formAreaIds = () => activeStudents.filter((st) => matchesAreas(st, ev.areas, ev.areaBasis)).map((st) => st.id);
  const formTargetCount = Array.isArray(ev.targetUids)
    ? ev.targetUids.length
    : ((ev.areas && ev.areas.length) ? formAreaIds().length : activeStudents.length);
  const openTargetModal = () => {
    if (!Array.isArray(ev.targetUids)) {
      const base = (ev.areas && ev.areas.length) ? formAreaIds() : activeStudents.map((st) => st.id);
      setEv((p) => ({ ...p, targetUids: base }));
    }
    setShowTargetModal(true);
  };
  const toggleTargetUid = (id) => setEv((p) => {
    const cur = Array.isArray(p.targetUids) ? p.targetUids : [];
    return { ...p, targetUids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
  });

  // ---- アンケート ----
  const surveyPayload = (published) => ({
    title: sv.title.trim(),
    desc: (sv.desc || "").trim(),
    dueDate: sv.dueDate || null,
    due: sv.dueDate ? `${Number(sv.dueDate.slice(5, 7))}/${Number(sv.dueDate.slice(8, 10))} まで` : "期限なし",
    time: sv.time || "約3分",
    questions: (sv.questions || []).map((q) => ({
      id: q.id, type: q.type, label: (q.label || "").trim(),
      options: q.type === "text" ? [] : (q.options || []).map((o) => o.trim()).filter(Boolean),
      required: q.required !== false,
    })),
    // 対象者：全員 or 特定イベントの参加者(出席/到着)
    audience: (sv.audType === "event" && sv.audEventId)
      ? { type: "event", eventId: sv.audEventId, group: sv.audGroup || "arrived" }
      : { type: "all" },
    grad: selectedYear,
    published,
  });
  const surveyValid = () =>
    sv.title.trim() && sv.questions.length > 0 &&
    sv.questions.every((q) => q.label.trim() && (q.type === "text" || (q.options || []).map((o) => o.trim()).filter(Boolean).length >= 1));
  const resetSurveyForm = () => { setSv(EMPTY_SV); setEditingSurveyId(null); setSelectedSvTpl(""); setSvShowTplSave(false); setSvTplName(""); };
  const submitSurvey = async (published) => {
    if (!surveyValid()) { setBanner("アンケート名と、各設問のタイトル・選択肢（選択式）を入力してください。"); return; }
    try {
      if (editingSurveyId) await updateSurvey(editingSurveyId, surveyPayload(published));
      else await addSurvey(surveyPayload(published));
      resetSurveyForm(); setShowSurveyForm(false);
    } catch (ex) { setBanner(`保存に失敗しました：${ex.message}`); }
  };
  const editSurvey = (s) => {
    setEditingSurveyId(s.id);
    const a = s.audience;
    setSv({
      title: s.title || "", desc: s.desc || "", dueDate: s.dueDate || "", time: s.time || "約3分",
      questions: surveyQuestions(s).map((q) => ({ id: q.id, type: q.type, label: q.label || "", options: q.type === "text" ? [] : (q.options && q.options.length ? [...q.options] : ["", ""]), required: q.required !== false })),
      audType: a && a.type === "event" ? "event" : "all",
      audEventId: a && a.type === "event" ? (a.eventId || "") : "",
      audGroup: a && a.type === "event" ? (a.group || "arrived") : "arrived",
    });
    setShowSurveyForm(true);
  };
  const publishSurveyDraft = (s) => updateSurvey(s.id, { published: true });

  // ---- 過去の履歴から複製 ----
  const openHistory = (kind) => { setHistoryExpanded(null); setHistoryPicker(kind); };
  const useEventFromHistory = (e) => {
    setEditingDraftId(null);
    setEv({ title: e.title || "", date: "", time: e.time || "18:00", place: e.place || "", copy: e.copy || "", deadlineDate: "", areas: e.areas || [], areaBasis: e.areaBasis || "either", targetUids: null });
    setShowEventForm(true);
    setHistoryPicker(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const useSurveyFromHistory = (s) => {
    setEditingSurveyId(null);
    setSv({
      title: s.title || "", desc: s.desc || "", dueDate: "", time: s.time || "約3分",
      questions: surveyQuestions(s).map((q) => ({ id: `q_${Math.random().toString(36).slice(2, 9)}`, type: q.type, label: q.label || "", options: q.type === "text" ? [] : (q.options && q.options.length ? [...q.options] : ["", ""]), required: q.required !== false })),
      audType: "all", audEventId: "", audGroup: "arrived",
    });
    setShowSurveyForm(true);
    setHistoryPicker(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // アンケートのテンプレート（回答期限は保存しない）
  const saveSurveyTemplate = async () => {
    if (!surveyValid()) { setBanner("先にアンケート内容を入力してください。"); return; }
    const name = svTplName.trim() || sv.title.trim() || "無題テンプレ";
    const data = { title: sv.title.trim(), desc: (sv.desc || "").trim(), time: sv.time || "約3分", questions: surveyPayload(true).questions };
    try { await addSurveyTemplate({ name, data }); setSvTplName(""); setSvShowTplSave(false); }
    catch (ex) { setBanner(`テンプレ保存に失敗：${ex.message}`); }
  };
  const loadSurveyTemplate = (tplId) => {
    const t = surveyTemplates.find((x) => x.id === tplId);
    if (!t || !t.data) return;
    setSv({
      title: t.data.title || "", desc: t.data.desc || "", dueDate: "", time: t.data.time || "約3分",
      questions: (t.data.questions || []).map((q) => ({ id: `q_${Math.random().toString(36).slice(2, 9)}`, type: q.type, label: q.label || "", options: q.type === "text" ? [] : (q.options && q.options.length ? [...q.options] : ["", ""]), required: q.required !== false })),
      audType: "all", audEventId: "", audGroup: "arrived",
    });
  };
  // 設問ビルダー操作
  const addSvQuestion = (type) => setSv((p) => ({ ...p, questions: [...p.questions, newQuestion(type)] }));
  const updateSvQuestion = (id, patch) => setSv((p) => ({ ...p, questions: p.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const removeSvQuestion = (id) => setSv((p) => ({ ...p, questions: p.questions.filter((q) => q.id !== id) }));
  const moveSvQuestion = (idx, dir) => setSv((p) => {
    const arr = [...p.questions]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return p;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    return { ...p, questions: arr };
  });
  const setSvOption = (qid, oi, val) => setSv((p) => ({ ...p, questions: p.questions.map((q) => (q.id === qid ? { ...q, options: q.options.map((o, i) => (i === oi ? val : o)) } : q)) }));
  const addSvOption = (qid) => setSv((p) => ({ ...p, questions: p.questions.map((q) => (q.id === qid ? { ...q, options: [...q.options, ""] } : q)) }));
  const removeSvOption = (qid, oi) => setSv((p) => ({ ...p, questions: p.questions.map((q) => (q.id === qid ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q)) }));

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
  // ---- Journey ドラッグ並び替え（PC=長押しドラッグ / スマホ=ドラッグ、Pointer Events で統一）----
  const jRowRefs = useRef([]);
  const onJDragStart = (e, index) => {
    e.preventDefault();
    setDragIndex(index);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onJDragMove = (e) => {
    if (dragIndex === null) return;
    const y = e.clientY;
    const list = journeys[selectedYear] || [];
    let target = list.length - 1;
    for (let k = 0; k < jRowRefs.current.length; k++) {
      const el = jRowRefs.current[k];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { target = k; break; }
    }
    if (target !== dragIndex && target >= 0 && target < list.length) {
      const nl = [...list];
      const [moved] = nl.splice(dragIndex, 1);
      nl.splice(target, 0, moved);
      setJourneys((prev) => ({ ...prev, [selectedYear]: nl }));
      setDragIndex(target);
    }
  };
  const onJDragEnd = () => {
    if (dragIndex === null) return;
    setDragIndex(null);
    saveJourney(selectedYear, journeysRef.current[selectedYear] || []);
  };
  // 1ステップを更新して即保存（リンク種別のセレクトなど）
  const updateJourneyAndSave = (id, patch) => {
    const list = (journeys[selectedYear] || []).map((x) => (x.id === id ? { ...x, ...patch } : x));
    setJourneys((prev) => ({ ...prev, [selectedYear]: list }));
    saveJourney(selectedYear, list);
  };
  const linkKindOf = (m) => (!m.link ? "" : /^https?:\/\//.test(m.link) ? "url" : m.link);

  // ---- テンプレ（種別＝categoryId でグループ化。すべて Firestore 管理） ----
  // 種別(カテゴリ)は templates コレクション内の _type:"category" ドキュメント、それ以外が本体テンプレ
  const templateCategories = savedTemplates.filter((t) => t._type === "category");
  const realTemplates = savedTemplates.filter((t) => t._type !== "category" && t._type !== "surveyTemplate");
  const surveyTemplates = savedTemplates.filter((t) => t._type === "surveyTemplate");
  const sortedCategories = [...templateCategories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const templatesInCat = (catId) =>
    realTemplates
      .filter((t) => (t.categoryId || null) === (catId || null))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "", "ja"));
  const selectedTplId = selectedTpl.startsWith("tpl:") ? selectedTpl.slice(4) : "";
  const tplBody = (savedTemplates.find((t) => String(t.id) === selectedTplId) || {}).body || "";

  const saveTemplate = async () => {
    const name = tplName.trim() || msg.split("\n")[0].slice(0, 14);
    await addTemplate({ name, body: msg, categoryId: tplSaveCat || null, order: templatesInCat(tplSaveCat).length });
    setTplName("");
    setTplSaveCat("");
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
      const r = await lineBroadcast({ target, targetLabel, body: msg, grad: selectedYear });
      setSent({ target: targetLabel, count: r.count ?? targetCount, line: r.lineCount, mail: r.mailCount });
      refreshBroadcasts();
      refreshQuota();
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
    : s.status === "テスト" ? "テスト"
    : s.status === "内定" ? "内定（承諾前）"
    : s.status === "承諾" ? "内定承諾済"
    : s.status === "辞退" ? "内定辞退" : "承諾後辞退";

  const exportStudentsCsv = () => {
    const header = ["氏名", "フリガナ", "大学", "卒年度", "ステータス", "メール", "電話番号", "郵便番号", "住所", "生年月日", "LINE連携", "タスク進捗"];
    const rows = yearStudents.map((s) => {
      const p = progressOf(s);
      return [s.name, s.kana || "", s.univ, `${s.grad || selectedYear}`, statusLabel(s), s.email, s.phone, s.zip, s.address, s.birth, s.lineUserId ? "連携済" : "未連携", `${p.done}/${p.total}`];
    });
    downloadCsv(`内定者一覧_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const exportAttendanceCsv = (e) => {
    const header = ["氏名", "大学", "ステータス", "出欠", "到着", "キャンセル理由"];
    const rows = eventAudience(e).map((st) => {
      const r = rsvpOf(st, e);
      const arr = r === "出席" ? (arrivedOf(st, e) ? "到着済" : "未到着") : "-";
      return [st.name, st.univ, statusLabel(st), r, arr, r === "欠席" ? reasonOf(st, e) : ""];
    });
    downloadCsv(`出欠_${e.title}_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const exportSurveyCsv = (s) => {
    const qs = surveyQuestions(s);
    const header = ["氏名", "大学", "回答状況", ...qs.map((q, i) => `Q${i + 1}:${q.label}`)];
    const rows = surveyAudience(s).map((st) => {
      const a = answerOf(st, s);
      const cells = qs.map((q) => {
        if (!a) return "";
        const v = a[q.id];
        return Array.isArray(v) ? v.join(" / ") : (v || "");
      });
      return [st.name, st.univ, a ? "回答済" : "未回答", ...cells];
    });
    downloadCsv(`アンケート回答_${s.title}_${selectedYear}卒.csv`, [header, ...rows]);
  };

  const tabs = [
    { key: "dash", label: "概況", icon: BarChart3 },
    { key: "students", label: "内定者", icon: Users },
    { key: "news", label: "記事", icon: Newspaper },
    { key: "qbox", label: "質問箱", icon: HelpCircle },
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
              <div className="flex items-center gap-1.5 mb-3">
                <button onClick={() => openHistory("event")}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND, background: "#fff" }}>
                  履歴から作成
                </button>
                <button onClick={() => (showEventForm ? resetForm() : setShowEventForm(true))}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                  style={showEventForm ? { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
                  {showEventForm ? "閉じる" : "+ イベントを追加"}
                </button>
              </div>
            </div>
            <div className="flex justify-end -mt-1 mb-2">
              <button onClick={refreshAnswers} className="flex items-center gap-1 text-xs font-bold text-gray-400">
                <RefreshCw size={12} /> 到着・出欠を更新
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
                  <input type="date" value={ev.deadlineDate} onChange={(e) => setEv({ ...ev, deadlineDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  <p className="text-[11px] text-gray-400 mt-1">この日を過ぎると学生は出欠を回答・変更できなくなります（未設定なら開催日まで回答可）。</p>
                </div>

                {/* 対象エリア（住所で絞る） */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">対象エリア（住所で絞る）</p>
                  <div className="flex gap-1.5 mb-2">
                    {[["current", "現住所"], ["home", "実家"], ["either", "どちらも"]].map(([v, label]) => (
                      <button key={v} onClick={() => setEv({ ...ev, areaBasis: v })}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border"
                        style={(ev.areaBasis || "either") === v ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AREAS.map((a) => {
                      const on = (ev.areas || []).includes(a.key);
                      return (
                        <button key={a.key}
                          onClick={() => setEv({ ...ev, areas: on ? ev.areas.filter((k) => k !== a.key) : [...(ev.areas || []), a.key] })}
                          className="text-xs font-bold px-2.5 py-1 rounded-full border"
                          style={on ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: INK, background: "#fff" }}>
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {(ev.areas || []).length === 0
                      ? "未選択＝全員に表示（エリアで絞りません）。"
                      : `選択したエリアに住む学生だけに表示・集計されます（住所は登録の${(ev.areaBasis || "either") === "current" ? "現住所" : (ev.areaBasis || "either") === "home" ? "実家住所" : "現住所または実家住所"}で判定）。`}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={openTargetModal}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND, background: "#fff" }}>
                      対象者を確認・個別調整
                    </button>
                    <span className="text-xs text-gray-500">対象 {formTargetCount}名{Array.isArray(ev.targetUids) ? "（個別調整あり）" : ""}</span>
                    {Array.isArray(ev.targetUids) && (
                      <button onClick={() => setEv({ ...ev, targetUids: null })} className="text-xs font-bold text-gray-400">個別指定を解除</button>
                    )}
                  </div>
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
              const aud = eventAudience(e);
              const audTotal = aud.length;
              const list = aud.map((st) => ({ st, r: rsvpOf(st, e) }));
              const yes = list.filter((x) => x.r === "出席").length;
              const arrivedCount = list.filter((x) => x.r === "出席" && arrivedOf(x.st, e)).length;
              const changedCount = list.filter((x) => (x.r === "出席" || x.r === "欠席") && changedOf(x.st, e)).length;
              const areaTxt = eventAreaText(e);
              const open = expandedEvent === e.id;
              return (
                <div key={e.id} className="bg-white border border-gray-200 rounded-xl mb-2 overflow-hidden">
                  <button onClick={() => setExpandedEvent(open ? null : e.id)} className="w-full text-left p-4">
                    <div className="flex justify-between text-sm gap-2">
                      <div className="min-w-0">
                        <p className="font-bold">
                          {e.title}
                          {e.closed && <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full align-middle" style={{ background: "#F3F4F6", color: "#6B7280" }}>受付終了済み</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{e.date}・{e.place}</p>
                        {areaTxt && <p className="text-xs mt-0.5" style={{ color: BRAND }}>対象：{areaTxt}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">参加 {yes}/{audTotal}</p>
                        {yes > 0 && <p className="text-xs mt-0.5" style={{ color: "#1E874B" }}>到着 {arrivedCount}/{yes}</p>}
                        {changedCount > 0 && <p className="text-xs mt-0.5 font-bold" style={{ color: "#B45309" }}>回答変更 {changedCount}件</p>}
                        <p className="text-xs mt-0.5" style={{ color: BRAND }}>{open ? "閉じる ▲" : "回答者を見る ▼"}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${audTotal ? (yes / audTotal) * 100 : 0}%`, background: BRAND }} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-2.5">
                      {["出席", "欠席", "未回答"].map((k) => {
                        const g = list.filter((x) => x.r === k);
                        return (
                          <div key={k}>
                            <p className="text-xs font-bold text-gray-500 mb-1">
                              {k}（{g.length}名）
                              {k === "出席" && g.length > 0 && (
                                <span className="ml-1.5" style={{ color: "#1E874B" }}>／到着 {arrivedCount}名・未到着 {g.length - arrivedCount}名</span>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.length === 0 && <span className="text-xs text-gray-300">なし</span>}
                              {g.map((x) => {
                                const arr = k === "出席" && arrivedOf(x.st, e);
                                const chg = (k === "出席" || k === "欠席") && changedOf(x.st, e);
                                const reason = k === "欠席" && reasonOf(x.st, e);
                                const style = k === "出席"
                                  ? (arr ? { background: "#EAF7EE", color: "#1E874B" } : { background: BRAND_LIGHT, color: BRAND })
                                  : k === "欠席" ? { background: "#F3F4F6", color: "#6B7280" } : { background: "#FFF7E6", color: "#B45309" };
                                return (
                                  <button key={x.st.id} onClick={() => { setAttendAns(x.r); setCancelReason(reasonOf(x.st, e)); setAttendEdit({ e, st: x.st }); }}
                                    className="text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1" style={style}
                                    title={reason ? `キャンセル理由：${reason}` : "タップで変更"}>
                                    {arr && <CheckCircle2 size={11} />}{x.st.name}
                                    {chg && <span className="ml-0.5 px-1 rounded" style={{ background: "#B45309", color: "#fff", fontSize: 9 }}>変更</span>}
                                    {reason && <span className="ml-0.5" style={{ fontSize: 10 }}>📝</span>}
                                  </button>
                                );
                              })}
                            </div>
                            {k === "出席" && g.length > 0 && (
                              <p className="text-[11px] text-gray-400 mt-1">名前をタップで出欠・到着を変更できます（緑＝到着済み／ピンク＝未到着）。</p>
                            )}
                          </div>
                        );
                      })}
                      {changedCount > 0 && (
                        <p className="text-[11px] font-bold" style={{ color: "#B45309" }}>「変更」＝回答済みの学生が出欠を変更しました。内容を確認したら「変更を確認」を押すと表示が消えます。</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <button onClick={() => exportAttendanceCsv(e)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>
                          <Download size={12} /> 出欠をCSV出力
                        </button>
                        {e.closed ? (
                          <button onClick={() => updateEvent(e.id, { closed: false })} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white">受付を再開</button>
                        ) : (
                          <button onClick={() => updateEvent(e.id, { closed: true })} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#F5D08C", color: "#B45309", background: "#FFF7E6" }}>最終受付終了（到着も締切）</button>
                        )}
                        {changedCount > 0 && (
                          <button onClick={() => ackEventChanges(e)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#F5D08C", color: "#B45309", background: "#FFF7E6" }}>
                            変更を確認（{changedCount}）
                          </button>
                        )}
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
              <div className="flex items-center gap-1.5 mb-3">
                <button onClick={() => openHistory("survey")}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND, background: "#fff" }}>
                  履歴から作成
                </button>
                <button onClick={() => { if (showSurveyForm) resetSurveyForm(); setShowSurveyForm(!showSurveyForm); }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                  style={showSurveyForm ? { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" } : { background: BRAND, color: "#fff", borderColor: BRAND }}>
                  {showSurveyForm ? "閉じる" : "+ アンケートを追加"}
                </button>
              </div>
            </div>

            {showSurveyForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 space-y-3">
                {editingSurveyId && <p className="text-xs font-bold" style={{ color: BRAND }}>✎ 編集中</p>}

                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">アンケート名<span className="text-red-500 ml-0.5">*</span></p>
                  <input value={sv.title} onChange={(e) => setSv({ ...sv, title: e.target.value })}
                    placeholder="例）研修内容についての希望調査" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">説明<span className="font-normal text-gray-400 ml-1">（任意・学生のアンケート画面でタイトルの下に表示）</span></p>
                  <textarea value={sv.desc} onChange={(e) => setSv({ ...sv, desc: e.target.value })} rows={3}
                    placeholder="例）研修の内容を決めるためのアンケートです。所要3分ほどで終わります。回答は選考には影響しません。"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm leading-relaxed" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">回答期限</p>
                    <input type="date" value={sv.dueDate} onChange={(e) => setSv({ ...sv, dueDate: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">所要時間の目安</p>
                    <input value={sv.time} onChange={(e) => setSv({ ...sv, time: e.target.value })}
                      placeholder="例）約3分" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                </div>

                {/* 対象者 */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-1">対象者</p>
                  <div className="flex gap-2">
                    {[["all", "全員"], ["event", "イベント参加者"]].map(([v, label]) => (
                      <button key={v} onClick={() => setSv({ ...sv, audType: v })}
                        className="flex-1 py-2 rounded-lg text-xs font-bold border"
                        style={sv.audType === v ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {sv.audType === "event" && (
                    <div className="mt-2 space-y-2">
                      <select value={sv.audEventId} onChange={(e) => setSv({ ...sv, audEventId: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white">
                        <option value="">イベントを選択…</option>
                        {yearEvents.map((e) => (<option key={e.id} value={e.id}>{e.title}</option>))}
                      </select>
                      <div className="flex gap-2">
                        {[["yes", "出席者（回答）"], ["arrived", "到着者（当日来場）"]].map(([v, label]) => (
                          <button key={v} onClick={() => setSv({ ...sv, audGroup: v })}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold border"
                            style={sv.audGroup === v ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400">選んだイベントの参加者だけに、このアンケートが表示・集計されます。</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500">設問</p>
                  {sv.questions.length === 0 && <p className="text-xs text-gray-400">下のボタンから設問を追加してください。</p>}
                  {sv.questions.map((q, i) => (
                    <div key={q.id} className="border border-gray-200 rounded-lg p-3 space-y-2" style={{ background: "#FAFBFC" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">Q{i + 1}</span>
                        <select value={q.type} onChange={(e) => updateSvQuestion(q.id, { type: e.target.value, options: e.target.value === "text" ? [] : (q.options.length ? q.options : ["", ""]) })}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white">
                          <option value="single">単一選択</option>
                          <option value="multi">複数選択</option>
                          <option value="text">自由記述</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
                          <input type="checkbox" checked={q.required !== false} onChange={(e) => updateSvQuestion(q.id, { required: e.target.checked })} />必須
                        </label>
                        <button onClick={() => moveSvQuestion(i, -1)} disabled={i === 0} className="text-gray-400 disabled:opacity-25 text-xs">▲</button>
                        <button onClick={() => moveSvQuestion(i, 1)} disabled={i === sv.questions.length - 1} className="text-gray-400 disabled:opacity-25 text-xs">▼</button>
                        <button onClick={() => removeSvQuestion(q.id)} aria-label="設問を削除" className="text-gray-300"><Trash2 size={14} /></button>
                      </div>
                      <input value={q.label} onChange={(e) => updateSvQuestion(q.id, { label: e.target.value })}
                        placeholder="設問文（例：参加しやすい時間帯は？）" className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
                      {q.type !== "text" && (
                        <div className="space-y-1.5">
                          {q.options.map((o, oi) => (
                            <div key={oi} className="flex items-center gap-1.5">
                              <input value={o} onChange={(e) => setSvOption(q.id, oi, e.target.value)}
                                placeholder={`選択肢${oi + 1}`} className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" />
                              <button onClick={() => removeSvOption(q.id, oi)} disabled={q.options.length <= 1} aria-label="選択肢を削除" className="text-gray-300 disabled:opacity-25"><X size={14} /></button>
                            </div>
                          ))}
                          <button onClick={() => addSvOption(q.id)} className="text-xs font-bold" style={{ color: BRAND }}>＋ 選択肢を追加</button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {[["single", "＋ 単一選択"], ["multi", "＋ 複数選択"], ["text", "＋ 自由記述"]].map(([t, label]) => (
                      <button key={t} onClick={() => addSvQuestion(t)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => submitSurvey(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: "#D7DEDB", color: "#6B7280", background: "#fff" }}>
                    下書き保存
                  </button>
                  <button onClick={() => submitSurvey(true)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: BRAND }}>
                    {editingSurveyId ? "更新して公開" : "公開する"}
                  </button>
                </div>
              </div>
            )}

            {/* アンケート下書き */}
            {yearSurveyDrafts.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-bold text-gray-500">下書き（{yearSurveyDrafts.length}）</p>
                {yearSurveyDrafts.map((s) => (
                  <div key={s.id} className="bg-white border rounded-xl p-3 flex items-center justify-between gap-2" style={{ borderColor: "#F5D08C" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{s.title || "（無題）"}</p>
                      <p className="text-xs text-gray-400">設問 {surveyQuestions(s).length}問・下書き</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => editSurvey(s)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>編集</button>
                      <button onClick={() => publishSurveyDraft(s)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>公開</button>
                      <button onClick={() => doDeleteSurvey(s.id)} className="text-gray-300 p-1"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {yearSurveys.map((s) => {
              const aud = surveyAudience(s);
              const audTotal = aud.length;
              const list = aud.map((st) => ({ st, r: answeredOf(st, s) }));
              const done = list.filter((x) => x.r === "回答済").length;
              const open = expandedSurvey === s.id;
              const targeted = s.audience && s.audience.type === "event";
              return (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl mb-2 overflow-hidden">
                  <button onClick={() => setExpandedSurvey(open ? null : s.id)} className="w-full text-left p-4">
                    <div className="flex justify-between text-sm gap-2">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{s.title}</p>
                        {targeted && <p className="text-xs mt-0.5" style={{ color: "#5B8DEF" }}>対象：{audienceLabel(s)}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">{done}/{audTotal} 回答</p>
                        <p className="text-xs mt-0.5" style={{ color: "#5B8DEF" }}>{open ? "閉じる ▲" : "回答者を見る ▼"}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${audTotal ? (done / audTotal) * 100 : 0}%`, background: "#5B8DEF" }} />
                    </div>
                  </button>
                  {open && (() => {
                    const detail = aud.map((st) => ({ st, a: answerOf(st, s) }));
                    const answered = detail.filter((x) => x.a);
                    const unanswered = detail.filter((x) => !x.a);
                    const qs = surveyQuestions(s);
                    const toArr = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
                    return (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                        {qs.map((q, qi) => {
                          if (q.type === "text") {
                            const texts = answered.filter((x) => (x.a[q.id] || "").toString().trim());
                            return (
                              <div key={q.id}>
                                <p className="text-xs font-bold text-gray-500 mb-2">Q{qi + 1}. {q.label}（自由記述）</p>
                                {texts.length === 0 ? (
                                  <p className="text-xs text-gray-300">記述回答はまだありません</p>
                                ) : texts.map((x) => (
                                  <div key={x.st.id} className="bg-gray-50 rounded-lg p-3 mb-1.5">
                                    <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{x.a[q.id]}</p>
                                    <p className="text-xs text-gray-400 mt-1.5">— {x.st.name}（{x.st.univ}）</p>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div key={q.id}>
                              <p className="text-xs font-bold text-gray-500 mb-2">
                                Q{qi + 1}. {q.label}<span className="font-normal text-gray-400 ml-1">{q.type === "multi" ? "（複数選択可）" : ""}</span>
                              </p>
                              {(q.options || []).map((o) => {
                                const picked = answered.filter((x) => toArr(x.a[q.id]).includes(o));
                                const cnt = picked.length;
                                return (
                                  <button
                                    key={o}
                                    type="button"
                                    onClick={() => setOptionVoters({ qLabel: `Q${qi + 1}. ${q.label}`, option: o, list: picked.map((x) => x.st) })}
                                    aria-label={`「${o}」を選んだ回答者を見る`}
                                    className="block w-full text-left mb-2">
                                    <div className="flex justify-between text-xs mb-0.5">
                                      <span className="text-gray-700">{o}</span>
                                      <span className="text-gray-400">{cnt}名</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${answered.length ? (cnt / answered.length) * 100 : 0}%`, background: "#5B8DEF" }} />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
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
                          <button onClick={() => editSurvey(s)} className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND, background: "#fff" }}>編集</button>
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
                <div key={m.id} ref={(el) => (jRowRefs.current[i] = el)}
                  className="flex items-start gap-2 rounded-lg transition-shadow"
                  style={dragIndex === i
                    ? { background: "#FCE3EF", boxShadow: "0 4px 12px rgba(0,0,0,0.12)", userSelect: "none" }
                    : { userSelect: dragIndex !== null ? "none" : "auto" }}>
                  <div className="flex flex-col items-center shrink-0 pt-1.5">
                    <button
                      onPointerDown={(e) => onJDragStart(e, i)}
                      onPointerMove={onJDragMove}
                      onPointerUp={onJDragEnd}
                      onPointerCancel={onJDragEnd}
                      aria-label={`ステップ「${m.label}」をドラッグして並び替え`}
                      className="text-gray-400 cursor-grab active:cursor-grabbing p-0.5"
                      style={{ touchAction: "none" }}>
                      <GripVertical size={16} />
                    </button>
                    <span className="text-xs font-bold text-gray-400 w-5 text-center mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  </div>
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
              <p className="text-xs text-gray-400">左の <span className="align-middle">⠿</span> を掴んで上下にドラッグすると並び替えできます（PCは長押しドラッグ、スマホはドラッグ）。変更は学生画面のホームに即時反映されます。</p>
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

          <div className="mb-3">
            <p className="text-xs font-bold text-gray-500 mb-1.5">検索</p>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="名前・大学・住所・メール・電話など"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2.5 text-sm" />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} aria-label="検索をクリア"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 p-0.5"><X size={15} /></button>
              )}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-1.5">表示フィルター（ステータス）</p>
            <select value={listFilter} onChange={(e) => setListFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-bold bg-white">
              <option value="all">すべて</option>
              <option value="内定">内定（承諾前）</option>
              <option value="承諾">承諾済</option>
              <option value="辞退">内定辞退</option>
              <option value="承諾後辞退">承諾後辞退</option>
              <option value="テスト">テスト</option>
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
                            style={s.status === "承諾" ? { borderColor: BRAND, background: BRAND_LIGHT, color: BRAND } : s.status === "内定" ? { borderColor: "#F5D08C", background: "#FFF7E6", color: "#B45309" } : s.status === "テスト" ? { borderColor: "#C7B8DE", background: "#F3EEFA", color: "#7C5FB0" } : { borderColor: "#D1D5DB", background: "#F3F4F6", color: "#6B7280" }}>
                            <option value="内定">内定（承諾前）</option>
                            <option value="承諾">内定承諾済</option>
                            <option value="辞退">内定辞退</option>
                            <option value="承諾後辞退">承諾後辞退</option>
                            <option value="テスト">テスト</option>
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

          {showTestSection && (
            <div className="mt-5">
              <SectionTitle>テストアカウント</SectionTitle>
              <div className="bg-white border rounded-xl divide-y divide-gray-100" style={{ borderColor: "#E4D9F2" }}>
                {filteredTest.length === 0 && <p className="p-4 text-xs text-gray-400">該当する学生がいません</p>}
                {filteredTest.map((s) => (
                  <div key={s.id} className="p-3 flex items-center justify-between gap-2">
                    <button onClick={() => setDetailStudent(s.id)} className="min-w-0 text-left">
                      <p className="text-sm font-bold flex items-center gap-1">{s.name}<ChevronRight size={13} style={{ color: "#7C5FB0" }} /></p>
                      <p className="text-xs text-gray-500">{s.univ}</p>
                      <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#F3EEFA", color: "#7C5FB0" }}>テスト</span>
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
                            className="text-xs font-bold rounded-lg border px-2 py-1.5" style={{ borderColor: "#C7B8DE", background: "#F3EEFA", color: "#7C5FB0" }}>
                            <option value="内定">内定（承諾前）</option>
                            <option value="承諾">内定承諾済</option>
                            <option value="辞退">内定辞退</option>
                            <option value="承諾後辞退">承諾後辞退</option>
                            <option value="テスト">テスト</option>
                          </select>
                          <button onClick={() => setConfirmDeleteId(s.id)} aria-label={`${s.name}のアカウントを削除`} className="text-gray-300 p-1"><Trash2 size={15} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">テストアカウントは内定者数・LINE一括配信・出欠集計の対象外です。動作確認用にお使いください。</p>
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

      {tab === "news" && (
        <div className="px-4 pt-4 space-y-4">
          <SectionTitle>{editingArticleId ? "記事を編集" : "NEWS記事を投稿"}</SectionTitle>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">タイトル<span className="text-red-500 ml-0.5">*</span></p>
              <input value={artTitle} onChange={(e) => setArtTitle(e.target.value)} placeholder="例）内定者懇親会レポート" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">本文</p>
              <textarea value={artBody} onChange={(e) => setArtBody(e.target.value)} rows={5} placeholder="イベントの様子や感想を記入…" className="w-full border border-gray-300 rounded-lg p-3 text-sm" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">公開対象</p>
              <select value={artGrad} onChange={(e) => setArtGrad(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-bold bg-white">
                <option value="">全学年に公開</option>
                {cohorts.map((c) => <option key={c.year} value={c.year}>{c.year}卒のみ</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">写真（複数選択可・自動で圧縮されます）</p>
              <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-lg py-3 text-xs font-bold text-gray-500 cursor-pointer">
                <ImagePlus size={16} /> 写真を選ぶ
                <input type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
              </label>
              {artImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {artImages.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="w-full rounded-lg" style={{ height: 80, objectFit: "cover" }} />
                      <button onClick={() => removeArtImage(i)} aria-label="この写真を外す" className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-gray-300 p-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!editingArticleId && (
              <label className="flex items-start gap-2 text-xs" style={{ color: INK }}>
                <input type="checkbox" checked={artNotify} onChange={(e) => setArtNotify(e.target.checked)} className="mt-0.5" />
                <span>投稿時に<span className="font-bold" style={{ color: LINE_GREEN }}>対象者の公式LINE</span>へお知らせを送る（LINE連携済みの方のみ。メールは送りません）</span>
              </label>
            )}
            {artErr && <p className="text-xs font-bold" style={{ color: "#DC2626" }}>{artErr}</p>}
            {artBusy && <p className="text-xs text-gray-400">処理中…</p>}
            <div className="flex gap-2">
              <button disabled={!artTitle.trim() || artBusy} onClick={submitArticle}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                {artBusy ? "処理中…" : editingArticleId ? "記事を更新する" : (artNotify ? "投稿してLINE通知（即時公開）" : "記事を投稿する（即時公開）")}
              </button>
              {editingArticleId && (
                <button onClick={resetArtForm} disabled={artBusy}
                  className="px-3 py-2.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-500 bg-white">
                  取消
                </button>
              )}
            </div>
          </div>

          <SectionTitle>投稿済みの記事</SectionTitle>
          {articles.length === 0 ? (
            <p className="text-xs text-gray-400">まだ記事はありません。</p>
          ) : (
            <div className="space-y-2">
              {articles.map((a) => (
                <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                  {a.thumb ? (
                    <img src={a.thumb} alt="" className="rounded-lg shrink-0" style={{ width: 52, height: 52, objectFit: "cover" }} />
                  ) : (
                    <div className="rounded-lg shrink-0 flex items-center justify-center" style={{ width: 52, height: 52, background: "#F3F4F6" }}>
                      <Newspaper size={18} className="text-gray-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{a.title}</p>
                    <p className="text-xs text-gray-400">
                      {a.createdAt?.toDate ? `${a.createdAt.toDate().getFullYear()}.${a.createdAt.toDate().getMonth() + 1}.${a.createdAt.toDate().getDate()}` : ""}
                      ・{a.grad ? `${a.grad}卒` : "全学年"}・{a.published ? "公開中" : "非公開"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => startEditArticle(a)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>
                      編集
                    </button>
                    <button onClick={() => updateArticle(a.id, { published: !a.published })}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 bg-white">
                      {a.published ? "非公開に" : "公開する"}
                    </button>
                    {artDelId === a.id ? (
                      <>
                        <button onClick={() => doDeleteArticle(a.id)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>削除</button>
                        <button onClick={() => setArtDelId(null)} className="text-xs text-gray-400 px-1">取消</button>
                      </>
                    ) : (
                      <button onClick={() => setArtDelId(a.id)} aria-label="記事を削除" className="text-gray-300 p-1"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "qbox" && (
        <div className="px-4 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>質問箱</SectionTitle>
            <button onClick={loadQuestions} className="flex items-center gap-1 text-xs font-bold text-gray-400 mb-3">
              <RefreshCw size={12} /> 更新
            </button>
          </div>
          <p className="text-xs text-gray-500">
            未回答 <span className="font-bold" style={{ color: "#B45309" }}>{unansweredQ}</span> 件／全 {questions.length} 件。回答すると質問者の公式LINEへ通知します（連携時）。「公開」にすると学生全員の「みんなのQ&A」に匿名で表示されます。
          </p>
          {questions.length === 0 ? (
            <p className="text-xs text-gray-400">まだ質問はありません。</p>
          ) : (
            questions.map((q) => (
              <QuestionAdminCard key={q.id} q={q} reload={loadQuestions} setBanner={setBanner} />
            ))
          )}
        </div>
      )}

      {tab === "line" && (
        <div className="px-4 pt-4 space-y-4">
          <SectionTitle>LINE一括配信</SectionTitle>

          {/* 今月のLINE送信数（無料枠） */}
          {quota && quota.limit != null && (() => {
            const pct = quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
            const low = quota.remaining <= 20;
            const color = quota.remaining <= 0 ? "#DC2626" : low ? "#B45309" : LINE_GREEN;
            return (
              <div className="bg-white border rounded-xl p-3" style={{ borderColor: low ? "#F5D08C" : "#E5E7EB" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600">今月のLINE送信数（無料枠）</p>
                  <button onClick={refreshQuota} className="flex items-center gap-1 text-xs font-bold text-gray-400"><RefreshCw size={11} /> 更新</button>
                </div>
                <p className="text-sm font-bold mt-1" style={{ color }}>
                  {quota.used} / {quota.limit} 通<span className="text-xs font-normal text-gray-500 ml-1.5">（残り {quota.remaining} 通）</span>
                </p>
                <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">毎月リセットされます。枠を超えると送信できません。未連携者へのメールは枠の対象外です。</p>
              </div>
            );
          })()}
          {quota && quota.limit == null && (
            <p className="text-xs text-gray-400">送信数の上限は設定されていません（無制限プラン）。</p>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">配信対象</p>

              {/* ステータス別 */}
              <p className="text-[11px] font-bold text-gray-400 mb-1">ステータス別</p>
              <div className="flex flex-wrap gap-2">
                {["全員", "内定者（承諾前）", "内定承諾者", "タスク未完了者"].map((t) => (
                  <button key={t} onClick={() => setTarget(t)} className="text-xs font-bold px-3 py-2 rounded-full border"
                    style={!isEventTarget && target === t ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: INK }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* イベント参加状況で送る */}
              <p className="text-[11px] font-bold text-gray-400 mt-3 mb-1">イベント参加状況で送る</p>
              <select value={isEventTarget ? tEventId : ""}
                onChange={(e) => setTarget(e.target.value ? `event:${e.target.value}:yes` : "全員")}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-bold bg-white">
                <option value="">イベントを選択…</option>
                {yearEvents.map((e) => (<option key={e.id} value={e.id}>{e.title}</option>))}
              </select>
              {isEventTarget && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {["yes", "arrived", "no", "none"].map((g) => (
                    <button key={g} onClick={() => setTarget(`event:${tEventId}:${g}`)} className="text-xs font-bold px-3 py-2 rounded-full border"
                      style={tGroup === g ? { background: BRAND, color: "#fff", borderColor: BRAND } : { borderColor: "#D7DEDB", color: INK }}>
                      {groupLabelOf(g)}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs font-bold mt-3" style={{ color: BRAND }}>
                配信対象：{targetLabel}　{targetCount}名
              </p>
              <p className="text-xs text-gray-500 mt-1">
                未連携者にはメールで自動送信されます。辞退者は配信対象から自動的に除外されます。
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500">テンプレート</p>
                <button onClick={() => setShowTplManager((v) => !v)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>
                  {showTplManager ? "編集を閉じる" : "種別・テンプレを編集"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 items-start">
                <div className="space-y-2">
                  <select value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-bold bg-white">
                    <option value="">テンプレを選択…</option>
                    {sortedCategories.map((c) => {
                      const list = templatesInCat(c.id);
                      if (list.length === 0) return null;
                      return (
                        <optgroup key={c.id} label={c.name}>
                          {list.map((t) => (<option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>))}
                        </optgroup>
                      );
                    })}
                    {templatesInCat(null).length > 0 && (
                      <optgroup label="未分類">
                        {templatesInCat(null).map((t) => (<option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>))}
                      </optgroup>
                    )}
                  </select>
                  <button disabled={!tplBody} onClick={() => setMsg(tplBody)}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
                    この文面を使う
                  </button>
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

              {showTplManager && (
                <TemplateManager categories={sortedCategories} templates={realTemplates} setBanner={setBanner} />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500">メッセージ</p>
                <button onClick={() => setMsg((m) => m + "{name}")}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>
                  ＋ 名前を差し込む
                </button>
              </div>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4}
                placeholder={"例）{name}さん、こんにちは。内定者懇親会の出欠登録をお願いします。"}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm" />
              <p className="text-xs text-gray-500 mt-1.5">
                文中に <span className="font-bold" style={{ color: BRAND }}>{"{name}"}</span> と入れると、送信時に各内定者のマイページ登録名に自動で置き換わります。
              </p>
              {/\{name\}|\{名前\}/i.test(msg) && (
                <div className="mt-2 rounded-lg p-2.5 text-xs whitespace-pre-wrap" style={{ background: "#F4F7F6", color: INK }}>
                  <span className="font-bold text-gray-500">差し込み例：</span>
                  {msg.replace(/\{name\}|\{名前\}/gi, (activeStudents.find((s) => s.name)?.name) || "山田花子")}
                </div>
              )}
              <div className="mt-2">
                {!showTplSave ? (
                  <button disabled={!msg} onClick={() => setShowTplSave(true)} className="text-xs font-bold disabled:opacity-40" style={{ color: BRAND }}>
                    + このメッセージをテンプレとして保存
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="テンプレ名（例：懇親会リマインド）"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs" />
                    <div className="flex gap-2 items-center">
                      <select value={tplSaveCat} onChange={(e) => setTplSaveCat(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs bg-white">
                        <option value="">種別：未分類</option>
                        {sortedCategories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                      <button onClick={saveTemplate} className="text-xs font-bold px-3 py-2 rounded-lg text-white" style={{ background: BRAND }}>保存</button>
                      <button onClick={() => { setShowTplSave(false); setTplName(""); setTplSaveCat(""); }} className="text-xs text-gray-400 px-1">取消</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              {quota && quota.limit != null && (
                <p className="text-xs mb-1.5" style={{ color: overQuota ? "#DC2626" : "#6B7280" }}>
                  この配信でLINE <span className="font-bold">{lineTargetCount}通</span> を使用予定（今月の残り {quota.remaining} 通）
                  {overQuota && <span className="font-bold">／残り枠が不足しています。対象を分けるか翌月に送信してください。</span>}
                </p>
              )}
              <button disabled={!msg || sending || overQuota} onClick={send}
                className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: LINE_GREEN }}>
                <Send size={16} /> {sending ? "送信中…" : overQuota ? "送信枠が不足しています" : "LINEで一括送信"}
              </button>
            </div>
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

          {/* 配信履歴 */}
          <div>
            <div className="flex items-center justify-between">
              <SectionTitle>配信履歴</SectionTitle>
              <button onClick={refreshBroadcasts} className="flex items-center gap-1 text-xs font-bold text-gray-400 mb-3">
                <RefreshCw size={12} /> 更新
              </button>
            </div>
            <div className="rounded-xl p-3 text-xs mb-2" style={{ background: "#FFF7E6", color: "#8A6D3B", border: "1px solid #F5E0B8" }}>
              このアプリから送った一括配信の記録です。ここから送った内容は、<span className="font-bold">LINE公式アカウントManagerの「メッセージ配信」履歴には表示されません</span>（API送信のため）。各受信者のトークには通常どおり届きます。
            </div>
            {broadcasts.length === 0 ? (
              <p className="text-xs text-gray-400">まだ配信はありません。</p>
            ) : (
              <div className="space-y-2">
                {broadcasts.slice(0, bcLimit).map((b) => {
                  const open = expandedBc === b.id;
                  const hasNames = (b.lineNames && b.lineNames.length) || (b.mailNames && b.mailNames.length);
                  return (
                    <div key={b.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedBc(open ? null : b.id)} className="w-full text-left p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold truncate">{b.target || "全員"}</p>
                          <p className="text-xs text-gray-400 shrink-0">{b.sentAt?.toDate ? b.sentAt.toDate().toLocaleString("ja-JP") : "—"}</p>
                        </div>
                        <p className="text-xs mt-1" style={{ color: LINE_GREEN }}>
                          LINE {b.lineCount ?? 0}件<span className="text-gray-400"> / メール {b.mailCount ?? 0}件（対象 {b.count ?? 0}名）</span>
                        </p>
                        {b.body && <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 whitespace-pre-wrap">{b.body}</p>}
                        <p className="text-xs mt-1.5" style={{ color: BRAND }}>{open ? "閉じる ▲" : "内容・宛先を見る ▼"}</p>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-2.5">
                          {b.body && (
                            <div>
                              <p className="text-[11px] font-bold text-gray-400 mb-1">本文</p>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2.5">{b.body}</p>
                            </div>
                          )}
                          {hasNames ? (
                            <>
                              {b.lineNames && b.lineNames.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold mb-1" style={{ color: LINE_GREEN }}>LINE送信（{b.lineNames.length}名）</p>
                                  <div className="flex flex-wrap gap-1 overflow-y-auto" style={{ maxHeight: 132 }}>
                                    {b.lineNames.map((n, i) => (
                                      <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#E7F9EE", color: "#059947" }}>{n}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {b.mailNames && b.mailNames.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold text-gray-500 mb-1">メール送信（{b.mailNames.length}名）</p>
                                  <div className="flex flex-wrap gap-1 overflow-y-auto" style={{ maxHeight: 132 }}>
                                    {b.mailNames.map((n, i) => (
                                      <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#6B7280" }}>{n}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-gray-400">この配信は宛先の記録がありません（機能追加より前の配信）。</p>
                          )}
                          <div className="flex justify-end pt-1">
                            {confirmDel === `bc:${b.id}` ? (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => removeBroadcast(b.id)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>この履歴を削除</button>
                                <button onClick={() => setConfirmDel(null)} className="text-xs font-bold px-2 py-1.5 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDel(`bc:${b.id}`)} className="flex items-center gap-1 text-xs font-bold" style={{ color: "#DC2626" }}>
                                <Trash2 size={13} /> この履歴を削除
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {broadcasts.length > bcLimit && (
                  <button onClick={() => setBcLimit((n) => n + 10)} className="w-full py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-500 bg-white">
                    さらに表示（残り {broadcasts.length - bcLimit} 件）
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 出欠編集モーダル */}
      {attendEdit && (() => {
        const { e, st } = attendEdit;
        const savedAns = rsvpOf(st, e);
        const arr = arrivedOf(st, e);
        const save = () => { setAdminRsvp(e, st, attendAns, attendAns === "欠席" ? cancelReason : ""); setAttendEdit(null); };
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40 px-6">
            <div className="bg-white rounded-2xl w-full max-w-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-400">出欠を変更</p>
                  <p className="text-lg font-bold mt-0.5">{st.name}</p>
                </div>
                <button onClick={() => setAttendEdit(null)} aria-label="閉じる"><X size={20} className="text-gray-400" /></button>
              </div>

              <p className="text-xs font-bold text-gray-500 mt-4 mb-1.5">出欠</p>
              <div className="flex gap-2">
                {["出席", "欠席", "未回答"].map((ans) => {
                  const on = attendAns === ans;
                  const c = ans === "出席" ? "#1E874B" : ans === "欠席" ? "#DC2626" : "#B45309";
                  return (
                    <button key={ans} onClick={() => setAttendAns(ans)}
                      className="flex-1 py-2 rounded-lg text-sm font-bold border"
                      style={on ? { background: c, color: "#fff", borderColor: c } : { borderColor: "#E5E7EB", color: "#6B7280", background: "#fff" }}>
                      {ans === "欠席" ? "欠席(キャンセル)" : ans}
                    </button>
                  );
                })}
              </div>

              {attendAns === "欠席" && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-gray-500 mb-1">キャンセル理由（任意）</p>
                  <textarea value={cancelReason} onChange={(ev2) => setCancelReason(ev2.target.value)} rows={2}
                    placeholder="例）当日体調不良のため" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                </div>
              )}

              {savedAns === "出席" && (
                <div className="mt-4">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">到着</p>
                  <button onClick={() => toggleArrival(e, st)}
                    className="w-full py-2 rounded-lg text-sm font-bold border inline-flex items-center justify-center gap-1.5"
                    style={arr ? { background: "#EAF7EE", color: "#1E874B", borderColor: "#BFE6CC" } : { borderColor: "#E5E7EB", color: "#6B7280", background: "#fff" }}>
                    {arr ? <><CheckCircle2 size={15} /> 到着済み（タップで取消）</> : "未到着（タップで到着済みにする）"}
                  </button>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button onClick={() => setAttendEdit(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-600 bg-white">閉じる</button>
                <button onClick={save} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: BRAND }}>保存</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 対象者を選ぶモーダル */}
      {showTargetModal && (() => {
        const sel = new Set(Array.isArray(ev.targetUids) ? ev.targetUids : []);
        const areaOf = (st) => {
          const cur = addressArea(st.address);
          const home = st.livesAtHome ? cur : addressArea(st.homeAddress);
          const labels = [];
          if (cur) labels.push(`現:${areaLabel(cur)}`);
          if (!st.livesAtHome && home) labels.push(`実:${areaLabel(home)}`);
          return labels.length ? labels.join(" / ") : "エリア不明";
        };
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black bg-opacity-40 px-4 pt-10">
            <div className="bg-white rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: "84vh" }}>
              <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-gray-100 shrink-0">
                <div>
                  <p className="text-xs text-gray-400">対象者を選ぶ（表示する学生）</p>
                  <p className="text-lg font-bold mt-0.5">表示 {sel.size} / {activeStudents.length}名</p>
                </div>
                <button onClick={() => setShowTargetModal(false)} aria-label="閉じる" className="-mt-0.5 -mr-1 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
              </div>
              <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5 shrink-0">
                <button onClick={() => setEv((p) => ({ ...p, targetUids: formAreaIds() }))} className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>エリアで選択</button>
                <button onClick={() => setEv((p) => ({ ...p, targetUids: activeStudents.map((s) => s.id) }))} className="text-xs font-bold px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600">全員</button>
                <button onClick={() => setEv((p) => ({ ...p, targetUids: [] }))} className="text-xs font-bold px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600">全員解除</button>
              </div>
              <div className="overflow-y-auto divide-y divide-gray-100">
                {activeStudents.map((st) => {
                  const on = sel.has(st.id);
                  return (
                    <button key={st.id} onClick={() => toggleTargetUid(st.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                      {on
                        ? <CheckCircle2 size={18} style={{ color: BRAND }} className="shrink-0" />
                        : <span className="inline-block shrink-0" style={{ width: 18, height: 18, borderRadius: 999, border: "1.5px solid #C9BFC3" }} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate" style={{ color: on ? INK : "#9CA3AF" }}>{st.name}</p>
                        <p className="text-xs text-gray-400 truncate">{st.univ}・{areaOf(st)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="p-3 border-t border-gray-100 shrink-0">
                <button onClick={() => setShowTargetModal(false)} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: BRAND }}>完了</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 選択肢の回答者モーダル */}
      {optionVoters && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black bg-opacity-40 px-4 pt-10" onClick={() => setOptionVoters(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-xs text-gray-400 truncate">{optionVoters.qLabel}</p>
                <p className="text-lg font-bold mt-0.5 break-words">「{optionVoters.option}」を選んだ人</p>
                <p className="text-xs text-gray-400 mt-0.5">{optionVoters.list.length}名</p>
              </div>
              <button onClick={() => setOptionVoters(null)} aria-label="閉じる" className="-mt-0.5 -mr-1 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-100">
              {optionVoters.list.length === 0 && <p className="text-xs text-gray-300 px-5 py-6 text-center">この選択肢を選んだ人はまだいません</p>}
              {optionVoters.list.map((st) => (
                <div key={st.id} className="px-5 py-2.5">
                  <p className="text-sm font-bold truncate">{st.name}</p>
                  <p className="text-xs text-gray-400 truncate">{st.univ}</p>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100 shrink-0">
              <button onClick={() => setOptionVoters(null)} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: BRAND }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 履歴から作成モーダル */}
      {historyPicker && (() => {
        const isEvent = historyPicker === "event";
        const items = isEvent
          ? [...events].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""))
          : [...surveys].sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || "") || ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-40 px-4 pt-10">
            <div className="bg-white rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: "82vh" }}>
              <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-gray-100 shrink-0">
                <div>
                  <p className="text-xs text-gray-400">履歴から作成</p>
                  <p className="text-lg font-bold mt-0.5">{isEvent ? "過去のイベント" : "過去のアンケート"}</p>
                </div>
                <button onClick={() => setHistoryPicker(null)} aria-label="閉じる" className="-mt-0.5 -mr-1 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={20} /></button>
              </div>
              <div className="p-4 overflow-y-auto">
                <p className="text-xs text-gray-500 mb-2">項目を選ぶと内容を確認でき、「この内容で新規作成」で入力欄に読み込みます（日付・回答期限は引き継ぎません）。</p>
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400">{isEvent ? "過去のイベントがありません。" : "過去のアンケートがありません。"}</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it) => {
                      const open = historyExpanded === it.id;
                      return (
                        <div key={it.id} className="border border-gray-200 rounded-xl overflow-hidden">
                          <button onClick={() => setHistoryExpanded(open ? null : it.id)} className="w-full text-left p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold truncate">{it.title || "（無題）"}</p>
                              <p className="text-xs text-gray-400 shrink-0">{it.grad ? `${it.grad}卒` : ""}{it.published === false ? "・下書き" : ""}</p>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {isEvent ? `${it.dateStr || "日付未定"}・${it.place || ""}` : `設問 ${surveyQuestions(it).length}問${it.dueDate ? `・期限 ${it.due || it.dueDate}` : ""}`}
                            </p>
                          </button>
                          {open && (
                            <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
                              {isEvent ? (
                                <div className="text-xs text-gray-600 space-y-1">
                                  {it.copy && <p className="whitespace-pre-wrap">{it.copy}</p>}
                                  <p>会場：{it.place || "-"}</p>
                                  <p>回答期限：{it.deadline || "-"}</p>
                                </div>
                              ) : (
                                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
                                  {surveyQuestions(it).map((q) => (
                                    <li key={q.id}>
                                      {q.label} <span className="text-gray-400">（{q.type === "text" ? "自由記述" : q.type === "multi" ? "複数選択" : "単一選択"}）</span>
                                      {q.type !== "text" && q.options?.length > 0 && <span className="text-gray-400">：{q.options.join("／")}</span>}
                                    </li>
                                  ))}
                                </ol>
                              )}
                              <button onClick={() => (isEvent ? useEventFromHistory(it) : useSurveyFromHistory(it))}
                                className="w-full py-2 rounded-lg text-xs font-bold text-white" style={{ background: BRAND }}>
                                この内容で新規作成
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 詳細モーダル */}
      {detailStudent && (() => {
        const d = students.find((x) => x.id === detailStudent);
        if (!d) return null;
        const p = progressOf(d);
        // 閲覧表示（従来どおりの並び）。フリガナ・郵便番号・住所も含めて一覧表示
        const rows = [
          ["フリガナ", d.kana || "-"],
          ["卒年度", `${d.grad || 2027}年卒`],
          ["ステータス", statusLabel(d)],
          ["大学", d.univ || "-"],
          ["生年月日", d.birth || "-"],
          ["メールアドレス", d.email || "-"],
          ["電話番号", d.phone || "-"],
          ["郵便番号", d.zip ? `〒${d.zip}` : "-"],
          ["住所", d.address || "-"],
          ...(d.livesAtHome
            ? [["実家住所", "現住所と同じ（実家在住）"]]
            : [
                ["実家の郵便番号", d.homeZip ? `〒${d.homeZip}` : "-"],
                ["実家の住所", d.homeAddress || "-"],
              ]),
          ["LINE連携", d.lineUserId ? "連携済み" : "未連携"],
          ["タスク進捗", `${p.done}/${p.total} 完了`],
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-6">
            <div className="bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
              {/* 固定ヘッダー：名前の横に編集、右上に閉じる（スクロールで隠れない） */}
              <div className="flex items-start justify-between gap-2 p-5 pb-3 border-b border-gray-100 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">内定者情報</p>
                  <p className="text-lg font-bold mt-0.5 truncate">{d.name}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!editDetail && (
                    <button onClick={() => setEditDetail(true)}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>
                      編集
                    </button>
                  )}
                  <button onClick={() => setDetailStudent(null)} aria-label="閉じる"
                    className="-mt-0.5 -mr-1 p-1.5 rounded-full text-gray-500 hover:bg-gray-100">
                    <X size={20} />
                  </button>
                </div>
              </div>
              {/* スクロール領域：情報のみスクロール */}
              <div className="p-5 pt-3 overflow-y-auto">
                {editDetail ? (
                  <>
                    <p className="text-xs font-bold text-gray-500 mb-1.5">編集できる項目</p>
                    <StudentEditor key={d.id} student={d} setBanner={setBanner} onDone={() => setEditDetail(false)} />
                    <p className="text-xs text-gray-400 mt-3 leading-relaxed">氏名・生年月日・メールは学生本人の申告情報のため編集できません（メールはログインIDのため変更不可）。</p>
                  </>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100">
                      {rows.map(([k, v]) => (
                        <div key={k} className="py-2.5 flex justify-between gap-3 text-sm">
                          <span className="text-xs text-gray-500 pt-0.5 shrink-0">{k}</span>
                          <span className="font-medium text-right break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3 leading-relaxed">連絡先やフリガナを直すには、右上の「編集」を押してください。</p>
                  </>
                )}
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
          const badge = t.key === "qbox" && unansweredQ > 0 ? unansweredQ : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 py-2.5 flex flex-col items-center gap-0.5 relative" style={{ color: active ? BRAND : "#9AA7A2" }}>
              <div className="relative">
                <Icon size={20} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 text-white rounded-full font-bold flex items-center justify-center"
                    style={{ background: "#DC2626", fontSize: 9, minWidth: 15, height: 15, padding: "0 3px" }}>{badge}</span>
                )}
              </div>
              <span className="text-xs font-bold">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// 学生の連絡先などを管理者が編集する（氏名・生年月日・メールは編集不可）
function StudentEditor({ student, setBanner, onDone }) {
  const [d, setD] = useState({
    kana: student.kana || "", univ: student.univ || "", phone: student.phone || "",
    zip: student.zip || "", address: student.address || "",
    livesAtHome: student.livesAtHome === true,
    homeZip: student.homeZip || "", homeAddress: student.homeAddress || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  const zipRe = /^\d{3}-\d{4}$/;
  const phoneRe = /^\d{2,4}-\d{2,4}-\d{3,4}$/;

  const save = async () => {
    if (d.phone.trim() && !phoneRe.test(d.phone.trim())) { setBanner("電話番号はハイフン入りで入力してください（例：090-1234-5678）。"); return; }
    if (d.zip.trim() && !zipRe.test(d.zip.trim())) { setBanner("郵便番号はハイフン入りで入力してください（例：123-4567）。"); return; }
    if (!d.livesAtHome && d.homeZip.trim() && !zipRe.test(d.homeZip.trim())) { setBanner("実家の郵便番号はハイフン入りで入力してください（例：123-4567）。"); return; }
    setSaving(true);
    try {
      await updateStudent(student.id, {
        kana: d.kana.trim(), univ: d.univ.trim(), phone: d.phone.trim(),
        zip: d.zip.trim(), address: d.address.trim(),
        livesAtHome: d.livesAtHome,
        homeZip: d.livesAtHome ? d.zip.trim() : d.homeZip.trim(),
        homeAddress: d.livesAtHome ? d.address.trim() : d.homeAddress.trim(),
      });
      setBanner("");
      if (onDone) onDone();
    } catch (ex) { setBanner(`保存に失敗しました：${ex.message}`); }
    finally { setSaving(false); }
  };

  const L = ({ children }) => <p className="text-[11px] font-bold text-gray-400 mb-1">{children}</p>;
  const cls = "w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-2.5">
      <div><L>フリガナ</L><input value={d.kana} onChange={(e) => set("kana", e.target.value)} placeholder="サトウ ミサキ" className={cls} /></div>
      <div><L>大学・学部</L><input value={d.univ} onChange={(e) => set("univ", e.target.value)} placeholder="早稲田大学 商学部" className={cls} /></div>
      <div><L>電話番号（ハイフン必須）</L><input value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="090-1234-5678" className={cls} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><L>郵便番号</L><input value={d.zip} onChange={(e) => set("zip", e.target.value)} placeholder="123-4567" className={cls} /></div>
        <div className="col-span-2"><L>現住所</L><input value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="〇〇県〇〇市…" className={cls} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-500">
        <input type="checkbox" checked={d.livesAtHome} onChange={(e) => set("livesAtHome", e.target.checked)} />
        実家に住んでいる（実家＝現住所と同じ）
      </label>
      {!d.livesAtHome && (
        <div className="grid grid-cols-3 gap-2">
          <div><L>実家の郵便番号</L><input value={d.homeZip} onChange={(e) => set("homeZip", e.target.value)} placeholder="123-4567" className={cls} /></div>
          <div className="col-span-2"><L>実家の住所</L><input value={d.homeAddress} onChange={(e) => set("homeAddress", e.target.value)} placeholder="〇〇県〇〇市…" className={cls} /></div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: BRAND }}>
          {saving ? "保存中…" : "編集内容を保存"}
        </button>
        {onDone && (
          <button onClick={onDone} disabled={saving}
            className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-500 bg-white">
            取消
          </button>
        )}
      </div>
    </div>
  );
}

// 質問箱：1件分の回答・公開・削除
function QuestionAdminCard({ q, reload, setBanner }) {
  const [answer, setAnswer] = useState(q.answer || "");
  const [isPublic, setIsPublic] = useState(q.public === true);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleString("ja-JP") : "";
  const save = async () => {
    setBusy(true);
    try { await answerQuestion({ id: q.id, answer, isPublic }); await reload(); }
    catch (ex) { setBanner(`保存に失敗しました：${ex.message}`); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setConfirmDel(false); setBusy(true);
    try { await answerQuestion({ id: q.id, remove: true }); await reload(); }
    catch (ex) { setBanner(`削除に失敗しました：${ex.message}`); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400 truncate">{q.name || "（名前なし）"}{q.grad ? `・${q.grad}卒` : ""}{dateStr ? `・${dateStr}` : ""}</p>
        {q.answer
          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#EAF7EE", color: "#1E874B" }}>回答済み</span>
          : <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#FFF7E6", color: "#B45309" }}>未回答</span>}
      </div>
      <p className="text-sm whitespace-pre-wrap">{q.text}</p>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3}
        placeholder="回答を入力…" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        「みんなのQ&A」に匿名で公開する
      </label>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy || !answer.trim()} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: BRAND }}>
          {busy ? "処理中…" : q.answer ? "更新" : "回答して通知"}
        </button>
        {confirmDel ? (
          <>
            <button onClick={remove} className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-white" style={{ background: "#DC2626" }}>削除する</button>
            <button onClick={() => setConfirmDel(false)} className="text-xs text-gray-400 px-1">取消</button>
          </>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="text-xs font-bold text-gray-400 ml-auto">削除</button>
        )}
      </div>
    </div>
  );
}

// テンプレの種別（カテゴリ）とテンプレ本体を管理する
function TemplateManager({ categories, templates, setBanner }) {
  const [catName, setCatName] = useState("");
  const [confirmCat, setConfirmCat] = useState(null);
  const [confirmTpl, setConfirmTpl] = useState(null);
  const [tForm, setTForm] = useState(null); // {id?, name, body, categoryId}

  const inCat = (cid) =>
    templates
      .filter((t) => (t.categoryId || null) === (cid || null))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "", "ja"));

  const addCat = async () => {
    const name = catName.trim();
    if (!name) return;
    try { await addTemplateCategory({ name, order: categories.length }); setCatName(""); }
    catch (ex) { setBanner(`種別の追加に失敗しました：${ex.message}`); }
  };
  const renameCat = async (id, name) => {
    try { await updateTemplateCategory(id, { name }); }
    catch (ex) { setBanner(`種別の更新に失敗しました：${ex.message}`); }
  };
  const moveCat = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= categories.length) return;
    try {
      await Promise.all([
        updateTemplateCategory(categories[idx].id, { order: j }),
        updateTemplateCategory(categories[j].id, { order: idx }),
      ]);
    } catch (ex) { setBanner(`並び替えに失敗しました：${ex.message}`); }
  };
  const removeCat = async (id) => {
    setConfirmCat(null);
    try {
      await Promise.all(inCat(id).map((t) => updateTemplate(t.id, { categoryId: null })));
      await deleteTemplateCategory(id);
    } catch (ex) { setBanner(`種別の削除に失敗しました：${ex.message}`); }
  };
  const saveTpl = async () => {
    if (!tForm) return;
    const name = (tForm.name || "").trim() || (tForm.body || "").split("\n")[0].slice(0, 14);
    if (!(tForm.body || "").trim()) { setBanner("テンプレの本文を入力してください。"); return; }
    try {
      if (tForm.id) await updateTemplate(tForm.id, { name, body: tForm.body, categoryId: tForm.categoryId || null });
      else await addTemplate({ name, body: tForm.body, categoryId: tForm.categoryId || null, order: inCat(tForm.categoryId).length });
      setTForm(null);
    } catch (ex) { setBanner(`テンプレの保存に失敗しました：${ex.message}`); }
  };
  const removeTpl = async (id) => {
    setConfirmTpl(null);
    try { await deleteTemplate(id); }
    catch (ex) { setBanner(`テンプレの削除に失敗しました：${ex.message}`); }
  };

  const groups = [...categories.map((c) => ({ id: c.id, name: c.name })), { id: null, name: "未分類" }];

  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 space-y-4" style={{ background: "#FAFBFC" }}>
      {/* 種別（カテゴリ） */}
      <div>
        <p className="text-[11px] font-bold text-gray-400 mb-1.5">種別（カテゴリ）</p>
        <div className="space-y-1.5">
          {categories.length === 0 && <p className="text-xs text-gray-400">種別がありません。下で追加してください。</p>}
          {categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <div className="flex flex-col shrink-0">
                <button onClick={() => moveCat(i, -1)} disabled={i === 0} className="text-gray-400 disabled:opacity-25 leading-none text-xs">▲</button>
                <button onClick={() => moveCat(i, 1)} disabled={i === categories.length - 1} className="text-gray-400 disabled:opacity-25 leading-none text-xs">▼</button>
              </div>
              <input defaultValue={c.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) renameCat(c.id, v); }}
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold" />
              {confirmCat === c.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => removeCat(c.id)} className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: "#DC2626" }}>削除</button>
                  <button onClick={() => setConfirmCat(null)} className="text-xs px-1.5 py-1 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                </div>
              ) : (
                <button onClick={() => setConfirmCat(c.id)} aria-label={`種別「${c.name}」を削除`} className="text-gray-300 p-1 shrink-0"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center mt-2">
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="新しい種別（例：承諾前・イベント）"
            className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" />
          <button onClick={addCat} disabled={!catName.trim()} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: BRAND }}>種別を追加</button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">種別を削除しても、その中のテンプレは「未分類」に移動します（テンプレ自体は消えません）。</p>
      </div>

      {/* テンプレ一覧 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-bold text-gray-400">テンプレ</p>
          {!tForm && (
            <button onClick={() => setTForm({ name: "", body: "", categoryId: "" })} className="text-xs font-bold px-2.5 py-1 rounded-lg text-white" style={{ background: BRAND }}>＋ テンプレを追加</button>
          )}
        </div>

        {tForm && (
          <div className="border border-gray-200 rounded-lg p-2.5 space-y-2 mb-2 bg-white">
            <input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="テンプレ名"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold" />
            <select value={tForm.categoryId || ""} onChange={(e) => setTForm({ ...tForm, categoryId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
              <option value="">種別：未分類</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <textarea value={tForm.body} onChange={(e) => setTForm({ ...tForm, body: e.target.value })} rows={4}
              placeholder={"本文（{name} で登録名を差し込めます）"} className="w-full border border-gray-300 rounded-lg p-2.5 text-xs" />
            <div className="flex gap-2">
              <button onClick={saveTpl} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ background: BRAND }}>保存</button>
              <button onClick={() => setTForm(null)} className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-500 bg-white">取消</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {groups.map((g) => {
            const list = inCat(g.id);
            if (list.length === 0) return null;
            return (
              <div key={g.id ?? "none"}>
                <p className="text-[11px] font-bold mb-1" style={{ color: BRAND }}>{g.name}</p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
                  {list.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <p className="text-xs font-bold text-gray-700 truncate min-w-0">{t.name}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmTpl === t.id ? (
                          <>
                            <button onClick={() => removeTpl(t.id)} className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: "#DC2626" }}>削除</button>
                            <button onClick={() => setConfirmTpl(null)} className="text-xs px-1.5 py-1 rounded-lg border border-gray-300 text-gray-500 bg-white">取消</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setTForm({ id: t.id, name: t.name || "", body: t.body || "", categoryId: t.categoryId || "" })}
                              className="text-xs font-bold px-2 py-1 rounded-lg border" style={{ borderColor: BRAND, color: BRAND }}>編集</button>
                            <button onClick={() => setConfirmTpl(t.id)} aria-label={`テンプレ「${t.name}」を削除`} className="text-gray-300 p-1"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {templates.length === 0 && <p className="text-xs text-gray-400">テンプレがありません。「＋ テンプレを追加」で作成できます。</p>}
        </div>
      </div>
    </div>
  );
}
