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

export async function addSurvey(data) {
  const ref = await addDoc(collection(db, "surveys"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateSurvey = (id, patch) => updateDoc(doc(db, "surveys", id), patch);
export const deleteSurvey = (id) => deleteDoc(doc(db, "surveys", id));

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
export const setRsvp = (eventId, uid, answer) =>
  setDoc(doc(db, "rsvps", `${eventId}_${uid}`), {
    eventId,
    uid,
    answer,
    updatedAt: serverTimestamp(),
  });

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
export const submitResponse = (surveyId, uid, { q1, q2 }) =>
  setDoc(doc(db, "responses", `${surveyId}_${uid}`), {
    surveyId,
    uid,
    q1: q1 || [],
    q2: q2 || "",
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

export async function addTemplate({ name, body, createdBy }) {
  const ref = await addDoc(collection(db, "templates"), {
    name,
    body,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const deleteTemplate = (id) => deleteDoc(doc(db, "templates", id));

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
