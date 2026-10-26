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
