// ============================================================
// カラーパレット（2026-07 リブランド）
//  メイン＝淡いピンク #F7CAD0（面・背景・ヒーローで使用）
//  文字/ボタン等の可読性が要る箇所は、同系の濃いマゼンタ（ループちゃんの色）を使用
// ============================================================

// ---- 学生側パレット ----
export const PINK = "#F7CAD0"; // メインの淡いピンク（面）
export const PAPER = "#FDF0F4"; // ページ背景（淡いピンク寄りの生成り）
export const ROSE = "#E4007F"; // 濃いマゼンタ（CTA/リンク/見出し）＝ループちゃんのワンピース色
export const ROSE_DEEP = "#B10062"; // 濃色（グラデ・陰影）
export const IVORY = "#FFFFFF"; // マゼンタ上の文字色
export const MAUVE = "#E39AB4"; // くすみピンク（補助）
export const GOLD = "#C2A15C"; // 真鍮（アクセント）
export const HAIR = "#F3D9E2"; // 罫線（ピンク寄り）
export const MUTE = "#8A6E77"; // 補足テキスト
export const INK = "#3A2A30"; // 本文の濃色

// ---- 管理画面カラー（ブランド統一） ----
export const BRAND = "#E4007F";
export const BRAND_LIGHT = "#FCE3EF";
export const LINE_GREEN = "#06C755";

// ---- フォント：游ゴシック体に統一 ----
const YU_GOTHIC =
  "'Yu Gothic Medium','Yu Gothic','YuGothic','游ゴシック Medium','游ゴシック体','游ゴシック','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";

export const fontStyle = {
  fontFamily: YU_GOTHIC,
  color: INK,
};

export const studentFontStyle = {
  fontFamily: YU_GOTHIC,
  color: INK,
};

export const caps = (size = 10, color = MAUVE, ls = "0.22em") => ({
  fontSize: size,
  letterSpacing: ls,
  color,
  textTransform: "uppercase",
  fontWeight: 700,
});
