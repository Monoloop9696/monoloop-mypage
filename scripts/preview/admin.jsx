import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminHeader, AdminBody } from "../../src/pages/AdminApp";
import "../../src/index.css";

const ts = (s) => { const d = new Date(s); return { toDate: () => d, toMillis: () => d.getTime() }; };
const names = [
  ["青木 遥", "アオキ ハルカ", "中部第一大学 経済学部", "承諾", "愛知県名古屋市"], ["石川 蓮", "イシカワ レン", "東海中央大学 商学部", "承諾", "岐阜県岐阜市"],
  ["上田 美咲", "ウエダ ミサキ", "名港学院大学 文学部", "内定", "東京都新宿区"], ["大野 翔太", "オオノ ショウタ", "中部第一大学 工学部", "承諾", "愛知県豊田市"],
  ["加藤 結衣", "カトウ ユイ", "三河総合大学 経営学部", "承諾", "静岡県浜松市"], ["木村 大輝", "キムラ ダイキ", "東海中央大学 法学部", "内定", "大阪府大阪市"],
  ["小林 さくら", "コバヤシ サクラ", "名港学院大学 人間学部", "承諾", "三重県津市"], ["斎藤 陸", "サイトウ リク", "尾張国際大学 国際学部", "承諾", "愛知県一宮市"],
  ["高橋 七海", "タカハシ ナナミ", "三河総合大学 教育学部", "内定", "神奈川県横浜市"], ["山田 花子", "ヤマダ ハナコ", "中部第一大学 文学部", "承諾", "愛知県名古屋市"],
];
const students = names.map((n, i) => ({
  id: `u${i}`, name: n[0], kana: n[1], univ: n[2], status: n[3], grad: 2027, address: i === 5 ? "" : `${n[4]}1-1-1`, phone: i === 5 ? "" : "090-0000-0000",
  email: `s${i}@example.com`, lineUserId: [2, 5, 9].includes(i) ? null : `L${i}`, source: "ナビサイト", offerDate: "2026-06-10", acceptDate: n[3] === "承諾" ? "2026-06-25" : "",
}));
const events = [
  { id: "e1", title: "内定者懇親会", dateStr: "2026-11-20", date: "11月20日（金）18:00〜", time: "18:00", place: "名古屋本社 3F", deadlineDate: "2026-11-13", deadline: "11/13", published: true, grad: 2027, createdAt: ts("2026-10-20") },
  { id: "e2", title: "店舗見学ツアー", dateStr: "2026-12-05", date: "12月5日（土）13:00〜", time: "13:00", place: "栄店", deadlineDate: "2026-11-07", deadline: "11/7", published: true, grad: 2027, areas: ["tokai"], areaBasis: "either", createdAt: ts("2026-10-25") },
  { id: "e3", title: "10/1 内定式", dateStr: "2026-10-01", date: "10月1日（木）10:00〜", time: "10:00", place: "名古屋本社", deadlineDate: "2026-09-20", deadline: "9/20", published: true, grad: 2027, createdAt: ts("2026-09-01") },
];
const surveys = [
  { id: "s1", title: "入社前アンケート", due: "11/15", dueDate: "2026-11-15", time: "約3分", published: true, grad: 2027, questions: [{ id: "q1", type: "single", label: "希望の勤務地は？", options: ["東海", "関東", "関西"], required: true }], createdAt: ts("2026-10-28") },
  { id: "s2", title: "懇親会の感想", due: "10/10", dueDate: "2026-10-10", time: "約1分", published: true, grad: 2027, questions: [{ id: "q1", type: "text", label: "感想", required: true }], createdAt: ts("2026-10-02") },
  { id: "iv1", interview: true, title: "内定後面談の日程調整", grad: 2027, published: true, targetUids: ["u1", "u8", "u3"], dueDate: "2026-11-10", questions: [], createdAt: ts("2026-10-30"),
    bookings: { u1: { date: "2026-11-06", start: "14:00", end: "14:30", name: "石川 蓮", interviewer: "今井" }, u8: { date: "2026-11-09", start: "10:30", end: "11:00", name: "高橋 七海", interviewer: "今井" } },
    proposals: { u3: { slots: [{ id: "p1", date: "2026-11-11", start: "13:00", end: "15:00" }], note: "" } } },
];
const rsvps = [
  ...["u0", "u1", "u3", "u4", "u6", "u7"].map((uid) => ({ eventId: "e1", uid, answer: "yes" })), { eventId: "e1", uid: "u8", answer: "no" },
  { eventId: "e2", uid: "u0", answer: "yes" },
  ...students.map((s) => ({ eventId: "e3", uid: s.id, answer: "yes", arrived: true })),
];
const responses = ["u0", "u3", "u4", "u6"].map((uid) => ({ surveyId: "s1", uid, answers: { q1: "東海" } })).concat(students.slice(0, 8).map((s) => ({ surveyId: "s2", uid: s.id, answers: { q1: "楽しかった" } })));
const savedTemplates = [
  { id: "m1", _type: "meeting", uid: "u0", name: "青木 遥", date: "2026-10-15", time: "10:00", interviewer: "今井", grad: 2027, kind: "内定後面談" },
  { id: "se1", _type: "specialEntry", name: "テスト 太郎", status: "未対応", route: "special1", createdAt: ts("2026-11-03") },
  { id: "se2", _type: "specialEntry", name: "テスト 次郎", status: "未対応", route: "casual", createdAt: ts("2026-11-04") },
];
const cohorts = [{ year: 2027, active: true, initialPassword: "demo" }, { year: 2028, active: true, initialPassword: "demo" }];

function App() {
  const [pcMode, setPcMode] = useState(new URLSearchParams(location.search).get("sp") !== "1");
  const [slot, setSlot] = useState(null);
  const [journeys, setJourneys] = useState({ 2027: [], 2028: [] });
  const journeysRef = useRef(journeys);
  return (
    <div className="min-h-screen" style={{ background: "#F4F7F6" }}>
      <div className={`${pcMode ? "max-w-[1600px]" : "max-w-md"} mx-auto min-h-screen relative`}>
        <AdminHeader pcMode={pcMode} togglePcMode={() => setPcMode((v) => !v)} signOut={() => {}} setSlot={setSlot} />
        <AdminBody students={students} events={events} surveys={surveys} savedTemplates={savedTemplates}
          journeys={journeys} setJourneys={setJourneys} journeysRef={journeysRef} rsvps={rsvps} responses={responses}
          refreshAnswers={async () => {}} cohorts={cohorts} notices={[]} setBanner={() => {}} pc={pcMode} headerSlot={slot} />
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
