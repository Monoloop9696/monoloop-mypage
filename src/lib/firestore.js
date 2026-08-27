import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

// =====================================================================
// 表示用ヘルパー：保存された event（dateStr + time）から num/en/dateLabel を導出
// =====================================================================
const DOW_JP = ["日", "月", "火", "水", "木", "金", "土"];
const DOW_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function eventDisplay(ev) {
  const dateStr = ev.dateStr || "";
  const time = ev.time || "";
  let num = "", en = "", dateLabel = dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const jsd = new Date(y, m - 1, d);
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    num = `${mm}.${dd}`;
    en = DOW_EN[jsd.getDay()];
    dateLabel = `${y}-${mm}-${dd} (${DOW_JP[jsd.getDay()]})${time ? " " + time : ""}`;
  }
  return { ...ev, num, en, date: dateLabel };
}

const withId = (snap) => ({ id: snap.id, ...snap.data() });

// =====================================================================
// students
// =====================================================================
export function listenStudent(uid, cb) {
  return onSnapshot(doc(db, "students", uid), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );
}

export async function loadStudents() {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map(withId);
}

export function listenAllStudents(cb) {
  return onSnapshot(collection(db, "students"), (snap) => cb(snap.docs.map(withId)));
}

export function updateStudent(uid, patch) {
  return updateDoc(doc(db, "students", uid), patch);
}

// =====================================================================
// events（下書き = published:false を含む。学生は published のみ購読）
// =====================================================================
export async function loadEvents() {
  const snap = await getDocs(collection(db, "events"));
  return snap.docs.map(withId).map(eventDisplay);
}

export function listenPublishedEvents(grad, cb) {
  const q = query(
    collection(db, "events"),
    where("grad", "==", grad),
    where("published", "==", true)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map(withId)
      .map(eventDisplay)
      .sort((a, b) => (a.dateStr || "").localeCompare(b.dateStr || ""));
    cb(list);
  });
}

export function listenAllEvents(cb) {
  return onSnapshot(collection(db, "events"), (snap) =>
    cb(snap.docs.map(withId).map(eventDisplay))
  );
}

export async function addEvent(data) {
  // dateStr（YYYY-MM-DD）+ time から並び替え用の Timestamp を生成
  let date = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(data.dateStr || "")) {
    const [y, m, d] = data.dateStr.split("-").map(Number);
    const [hh, mm] = (data.time || "00:00").split(":").map(Number);
    date = Timestamp.fromDate(new Date(y, m - 1, d, hh || 0, mm || 0));
  }
  const ref = await addDoc(collection(db, "events"), {
    ...data,
    date,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateEvent = (id, patch) => updateDoc(doc(db, "events", id), patch);
export const deleteEvent = (id) => deleteDoc(doc(db, "events", id));

// イベント削除＋関連する出欠(rsvps)も一括削除
export async function deleteEventCascade(eventId) {
  const snap = await getDocs(query(collection(db, "rsvps"), where("eventId", "==", eventId)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "events", eventId));
  await batch.commit();
}

// =====================================================================
// surveys
// =====================================================================
export async function loadSurveys() {
  const snap = await getDocs(collection(db, "surveys"));
  return snap.docs.map(withId);
}

export function listenPublishedSurveys(grad, cb) {
  const q = query(
    collection(db, "surveys"),
    where("grad", "==", grad),
    where("published", "==", true)
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)));
}

export function listenAllSurveys(cb) {
  return onSnapshot(collection(db, "surveys"), (snap) => cb(snap.docs.map(withId)));
}

// 新形式(questions[])と旧形式(q1/opts/multi/q2)を吸収して設問配列を返す
// question = { id, type: "single"|"multi"|"text", label, options[], required }
export function surveyQuestions(s) {
  if (s && Array.isArray(s.questions) && s.questions.length) return s.questions;
  const out = [];
  if (s && s.q1) out.push({ id: "q1", type: s.multi ? "multi" : "single", label: s.q1, options: s.opts || [], required: true });
  if (s && s.q2) out.push({ id: "q2", type: "text", label: s.q2, required: false });
  return out;
}
// レスポンスを { [qid]: value }（配列＝選択 / 文字列＝記述）に正規化
export function responseAnswers(r) {
  if (r && r.answers) return r.answers;
  return { q1: (r && r.q1) || [], q2: (r && r.q2) || "" };
}

export async function addSurvey(data) {
  const ref = await addDoc(collection(db, "surveys"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateSurvey = (id, patch) => updateDoc(doc(db, "surveys", id), patch);
export const deleteSurvey = (id) => deleteDoc(doc(db, "surveys", id));

// アンケートのテンプレート（回答期限以外を保存）。templates コレクションに _type:"surveyTemplate" で保存＝ルール追加不要
export async function addSurveyTemplate({ name, data }) {
  const ref = await addDoc(collection(db, "templates"), { _type: "surveyTemplate", name, data, createdAt: serverTimestamp() });
  return ref.id;
}
export const deleteSurveyTemplate = (id) => deleteDoc(doc(db, "templates", id));

// アンケート削除＋関連する回答(responses)も一括削除
export async function deleteSurveyCascade(surveyId) {
  const snap = await getDocs(query(collection(db, "responses"), where("surveyId", "==", surveyId)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "surveys", surveyId));
  await batch.commit();
}

// =====================================================================
// journeys/{grad}: { steps: [...] }
// =====================================================================
export async function loadJourney(grad) {
  const s = await getDoc(doc(db, "journeys", String(grad)));
  return s.exists() ? s.data().steps || [] : [];
}

export function listenJourney(grad, cb) {
  return onSnapshot(doc(db, "journeys", String(grad)), (s) =>
    cb(s.exists() ? s.data().steps || [] : [])
  );
}

export const saveJourney = (grad, steps) =>
  setDoc(doc(db, "journeys", String(grad)), { steps }, { merge: true });

// =====================================================================
// cohorts/{year}: { year, initialPassword, joinDate(Timestamp), active }
//  ※ 読み取りは管理者のみ（Security Rules）。学生・未認証には見せない。
// =====================================================================
export function listenCohorts(cb) {
  return onSnapshot(collection(db, "cohorts"), (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.year || 0) - (b.year || 0));
    cb(list);
  });
}

// 卒年度を新規作成し、前年度（copyFromYear）の Journey を複製
export async function createCohort(year, initialPassword, copyFromYear) {
  const y = Number(year);
  const joinDate = Timestamp.fromDate(new Date(y, 3, 1)); // y年4月1日
  // 先に Journey を複製してから cohort を作成（cohorts購読の再読込より前に確定させる）
  if (copyFromYear) {
    const steps = await loadJourney(copyFromYear);
    if (steps.length) {
      const cloned = steps.map((s, i) => ({ ...s, id: `j${y}_${i + 1}` }));
      await saveJourney(y, cloned);
    }
  }
  await setDoc(doc(db, "cohorts", String(y)), {
    year: y,
    initialPassword,
    joinDate,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export const setCohortActive = (year, active) =>
  updateDoc(doc(db, "cohorts", String(year)), { active });

export const setCohortPassword = (year, initialPassword) =>
  updateDoc(doc(db, "cohorts", String(year)), { initialPassword });

// =====================================================================
// rsvps/{eventId}_{uid}
// =====================================================================
// changed=true（既回答から別の回答へ変更）のとき、管理者向けに changedAt/changeSeen を記録
export const setRsvp = (eventId, uid, answer, changed = false) =>
  setDoc(
    doc(db, "rsvps", `${eventId}_${uid}`),
    {
      eventId,
      uid,
      answer,
      updatedAt: serverTimestamp(),
      // 欠席に変更した場合は到着状態をリセット（merge で既存の arrived を保持しつつ上書き）
      ...(answer === "no" ? { arrived: false, arrivedAt: null } : {}),
      ...(changed ? { changedAt: serverTimestamp(), changeSeen: false } : {}),
    },
    { merge: true }
  );

// 管理者が「回答変更」を確認済みにする
export const markRsvpChangeSeen = (eventId, uid) =>
  updateDoc(doc(db, "rsvps", `${eventId}_${uid}`), { changeSeen: true });

// 管理者が学生の出欠を「未回答」に戻す（rsvpドキュメント削除）
export const deleteRsvp = (eventId, uid) => deleteDoc(doc(db, "rsvps", `${eventId}_${uid}`));

// 管理者が学生の出欠を設定（欠席時はキャンセル理由を保存。欠席にすると到着はリセット）
export const adminSetRsvp = (eventId, uid, answer, reason = "") =>
  setDoc(
    doc(db, "rsvps", `${eventId}_${uid}`),
    {
      eventId,
      uid,
      answer,
      updatedAt: serverTimestamp(),
      cancelReason: answer === "no" ? (reason || "") : null,
      ...(answer === "no" ? { arrived: false, arrivedAt: null } : {}),
    },
    { merge: true }
  );

// 管理者が学生の到着状態を切り替える（押し忘れ対応）
export const setRsvpArrived = (eventId, uid, arrived) =>
  setDoc(
    doc(db, "rsvps", `${eventId}_${uid}`),
    { eventId, uid, arrived: !!arrived, arrivedAt: arrived ? serverTimestamp() : null },
    { merge: true }
  );

// イベント当日の到着受付（学生が自分の rsvp に arrived を付与）
export const markArrived = (eventId, uid) =>
  setDoc(
    doc(db, "rsvps", `${eventId}_${uid}`),
    { eventId, uid, arrived: true, arrivedAt: serverTimestamp() },
    { merge: true }
  );

export function listenMyRsvps(uid, cb) {
  const q = query(collection(db, "rsvps"), where("uid", "==", uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export async function loadRsvpsForEvent(eventId) {
  const q = query(collection(db, "rsvps"), where("eventId", "==", eventId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function loadAllRsvps() {
  const snap = await getDocs(collection(db, "rsvps"));
  return snap.docs.map((d) => d.data());
}

// =====================================================================
// responses/{surveyId}_{uid}
// =====================================================================
// answers = { [questionId]: value }（value は文字列＝自由記述 / 配列＝選択）
export const submitResponse = (surveyId, uid, answers) =>
  setDoc(doc(db, "responses", `${surveyId}_${uid}`), {
    surveyId,
    uid,
    answers: answers || {},
    submittedAt: serverTimestamp(),
  });

export function listenMyResponses(uid, cb) {
  const q = query(collection(db, "responses"), where("uid", "==", uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export async function loadResponsesForSurvey(surveyId) {
  const q = query(collection(db, "responses"), where("surveyId", "==", surveyId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

// LINE/メール一括配信の履歴（管理者のみ read 可）。新しい順
export async function loadBroadcasts() {
  const snap = await getDocs(collection(db, "broadcasts"));
  return snap.docs
    .map(withId)
    .sort((a, b) => (b.sentAt?.toMillis?.() || 0) - (a.sentAt?.toMillis?.() || 0));
}

export async function loadAllResponses() {
  const snap = await getDocs(collection(db, "responses"));
  return snap.docs.map((d) => d.data());
}

// =====================================================================
// templates
// =====================================================================
export async function loadTemplates() {
  const snap = await getDocs(collection(db, "templates"));
  return snap.docs.map(withId);
}

export function listenTemplates(cb) {
  return onSnapshot(collection(db, "templates"), (snap) => cb(snap.docs.map(withId)));
}

export async function addTemplate({ name, body, categoryId = null, order = 0, createdBy }) {
  const ref = await addDoc(collection(db, "templates"), {
    name,
    body,
    categoryId: categoryId || null,
    order,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateTemplate = (id, patch) => updateDoc(doc(db, "templates", id), patch);
export const deleteTemplate = (id) => deleteDoc(doc(db, "templates", id));

// テンプレの種別（カテゴリ）は templates コレクション内に _type:"category" のドキュメントとして保存
// （新コレクションを作らないので Firestore ルールの追加デプロイが不要）
export async function addTemplateCategory({ name, order = 0 }) {
  const ref = await addDoc(collection(db, "templates"), { _type: "category", name, order, createdAt: serverTimestamp() });
  return ref.id;
}
export const updateTemplateCategory = (id, patch) => updateDoc(doc(db, "templates", id), patch);
export const deleteTemplateCategory = (id) => deleteDoc(doc(db, "templates", id));

// =====================================================================
// notices（お知らせ。全学年に表示。管理者が任意のタイミングで追加）
// =====================================================================
export function listenNotices(cb) {
  return onSnapshot(collection(db, "notices"), (snap) => {
    const list = snap.docs
      .map(withId)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(list);
  });
}

export async function addNotice(text) {
  const ref = await addDoc(collection(db, "notices"), {
    text,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const deleteNotice = (id) => deleteDoc(doc(db, "notices", id));

// =====================================================================
// articles（NEWS記事。本文＋写真。写真は images サブコレクションに圧縮base64で保存）
//   articles/{id} : { title, body, grad(null=全学年), published, createdAt }
//   articles/{id}/images/{imgId} : { data(dataURL), order, createdAt }
// =====================================================================
export function listenPublishedArticles(cb) {
  // Security Rules（published==true のみ学生に許可）に合わせ、クエリ自体を published で絞る。
  // 絞らずに全件取得すると学生ではクエリ全体が権限拒否され、1件も表示されない。
  const qy = query(collection(db, "articles"), where("published", "==", true));
  return onSnapshot(qy, (snap) => {
    const list = snap.docs
      .map(withId)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(list);
  });
}

export function listenAllArticles(cb) {
  return onSnapshot(collection(db, "articles"), (snap) => {
    const list = snap.docs
      .map(withId)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(list);
  });
}

export async function addArticle({ title, body = "", grad = null, published = true }) {
  const ref = await addDoc(collection(db, "articles"), {
    title,
    body,
    grad: grad ?? null,
    published,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateArticle = (id, patch) => updateDoc(doc(db, "articles", id), patch);

export async function addArticleImage(articleId, dataUrl, order = 0) {
  await addDoc(collection(db, "articles", articleId, "images"), {
    data: dataUrl,
    order,
    createdAt: serverTimestamp(),
  });
}

export async function loadArticleImages(articleId) {
  const snap = await getDocs(collection(db, "articles", articleId, "images"));
  return snap.docs.map(withId).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function listenArticleImages(articleId, cb) {
  return onSnapshot(collection(db, "articles", articleId, "images"), (snap) =>
    cb(snap.docs.map(withId).sort((a, b) => (a.order || 0) - (b.order || 0)))
  );
}

export const deleteArticleImage = (articleId, imgId) =>
  deleteDoc(doc(db, "articles", articleId, "images", imgId));

// 記事＋配下の画像を一括削除
export async function deleteArticleCascade(articleId) {
  const snap = await getDocs(collection(db, "articles", articleId, "images"));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "articles", articleId));
  await batch.commit();
}
