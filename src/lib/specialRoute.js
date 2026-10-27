// =====================================================================
// 特別選考ルート（スカウト媒体で配布する特別コード → 公開LP /special でルートを選んでエントリー）
//
// 保存先はすべて templates コレクション（管理者のみ read/write）＝ルール追加不要。
//   特別コード   : templates/special_code_<CODE>   {_type:"specialCode", code, label(媒体・送信回のメモ), expiresAt(YYYY-MM-DD|""), active, createdAt}
//   エントリー   : templates/special_entry_<hash>  {_type:"specialEntry", name, kana, univ, faculty, grad, email, phone, question,
//                                                   route, code, codeLabel, status, memo, createdAt, updatedAt, resubmitCount}
// 学生（未ログイン）は Firestore を直接触らず、公開API /api/public-cohorts の action=specialVerify / specialEntry 経由で読み書きする。
//
// ※ルートの id は api/public-cohorts.js の SPECIAL_ROUTE_IDS と必ず揃えること（サーバー側でも検証している）。
// =====================================================================

// 2026-10-26 変更：特別選考ルート①（説明会から）・特別選考ルート②（オープンカンパニーから）・カジュアル面談ルート
// ※旧 id "special"（旧・特別選考ルート）/"talk"（社員座談会）で保存されたエントリーは、管理画面では id がそのまま表示される
export const SPECIAL_ROUTES = [
  {
    id: "special1",
    tag: "おすすめ",
    recommended: true,
    name: "特別選考ルート①",
    who: "会社説明会に参加して、そのまま選考に進みたい方へ",
    steps: [
      { label: "説明会" },
      { label: "書類選考", skip: true },
      { label: "一次面接" },
      { label: "二次面接" },
      { label: "最終面接" },
      { label: "内定" },
    ],
    time: "説明会からスタート",
    pace: "書類選考なし",
    next: "3営業日以内に、説明会の日程についてメールでご連絡します。",
  },
  {
    id: "special2",
    tag: "体験してから",
    name: "特別選考ルート②",
    who: "オープンカンパニーで会社を体験してから、選考に進みたい方へ",
    steps: [
      { label: "オープンカンパニー" },
      { label: "書類選考", skip: true },
      { label: "一次面接" },
      { label: "最終面接" },
      { label: "内定" },
    ],
    time: "オープンカンパニーからスタート",
    pace: "書類選考なし",
    next: "3営業日以内に、オープンカンパニーの日程についてメールでご連絡します。",
  },
  {
    id: "casual",
    tag: "まずは話を聞く",
    name: "カジュアル面談ルート",
    who: "会社のことをもっと知ってから、選考に進むか考えたい方へ",
    steps: [
      { label: "社員と30分の面談（選考ではありません）" },
      { label: "希望すれば特別選考ルート①・②へ" },
    ],
    time: "30分・オンライン",
    pace: "評価はしません",
    next: "3営業日以内に、面談の日程についてメールでご連絡します。",
  },
];

export const SPECIAL_STATUSES = ["未対応", "連絡済", "日程調整済", "選考中", "内定", "辞退", "見送り"];

export const specialRouteName = (id) => (SPECIAL_ROUTES.find((r) => r.id === id) || {}).name || id || "";

// コードは英大文字・数字・ハイフンのみ（3〜20文字）。入力は空白を除いて大文字化する
export const normalizeSpecialCode = (s) => (s || "").replace(/\s+/g, "").toUpperCase();
export const isValidSpecialCode = (s) => /^[A-Z0-9-]{3,20}$/.test(s || "");
export const specialCodeDocId = (code) => `special_code_${code}`;

// スカウト本文に貼るURL（?code= でコード欄が埋まった状態で開く）
export const APP_URL = "https://monoloop-mypage.vercel.app";
export const specialUrl = (code) => `${APP_URL}/special${code ? `?code=${encodeURIComponent(code)}` : ""}`;

// 日本時間の今日（YYYY-MM-DD）。有効期限の判定に使う
export const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// コードの状態: "on"=受付中 / "exp"=期限切れ / "off"=停止中
export const specialCodeState = (c) => {
  if (!c || c.active === false) return "off";
  if (c.expiresAt && c.expiresAt < todayJst()) return "exp";
  return "on";
};

// ---------------------------------------------------------------------
// 説明会・オープンカンパニーの候補日程（templates/_type:"specialSlot"）
//   LP・公開API・管理画面で同じ判定を使うため、ここに純粋ロジックをまとめる（API も import する）
// ---------------------------------------------------------------------
export const SLOT_KINDS = { seminar: "説明会", oc: "オープンカンパニー" };

// ルート → 日程の種別。casual は日程の設問なし
export const slotKindForRoute = (routeId) => (routeId === "special1" ? "seminar" : routeId === "special2" ? "oc" : null);

export const weekdayJa = (dateStr) => ["日", "月", "火", "水", "木", "金", "土"][new Date(`${dateStr}T00:00:00`).getDay()] || "";

// "10/15（水）14:00〜15:00"（end が空なら "10/15（水）14:00"）
export const formatSlotLabel = (slot) => {
  const d = String(slot.date || "");
  const md = d.length >= 10 ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${weekdayJa(d)}）` : d;
  return `${md}${slot.start || ""}${slot.end ? `〜${slot.end}` : ""}`;
};

// 残り人数が 0 のときだけ満員（null/undefined は人数を出さないだけで受付可）
export const isSlotFull = (slot) => slot.remaining === 0;

// 学生に見せる枠：受付中・種別一致・今日以降。日付→開始時刻の昇順。満員は含める（表示側で disabled）
export const selectableSlots = (slots, { kind, today }) =>
  (slots || [])
    .filter((s) => s.active !== false && s.kind === kind && (s.date || "") >= today)
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));

// エントリー時の候補の検証（LP と API で共通）
export const validateSlotSelection = ({ routeId, slotIds, otherDate, slots, today }) => {
  const kind = slotKindForRoute(routeId);
  if (!kind) return { ok: true, slotIds: [] };
  const open = selectableSlots(slots, { kind, today });
  if (open.length === 0) return { ok: true, slotIds: [] }; // 公開枠なし＝設問を出さない
  const allowed = new Set(open.filter((s) => !isSlotFull(s)).map((s) => s.id));
  const picked = (Array.isArray(slotIds) ? slotIds : []).filter((id) => allowed.has(id));
  if (picked.length === 0 && otherDate !== true) return { ok: false, error: "候補日程を選ぶか、別日での調整を希望してください。" };
  return { ok: true, slotIds: picked };
};
