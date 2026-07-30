import { BRAND, GOLD, HAIR, MUTE, caps } from "../theme";

// 管理画面：セクション見出し
export function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full" style={{ background: BRAND }} />
      <h2 className="text-sm font-bold tracking-wide">{children}</h2>
    </div>
  );
}

// 学生側：セクション見出し（英字キャプション＋明朝）
export function EdHeader({ en, jp, note }) {
  return (
    <div className="mb-5">
      <p style={caps(10, GOLD)}>{en}</p>
      <div className="flex items-end justify-between mt-1.5">
        <h2 className="jp-mincho font-bold" style={{ fontSize: 21, lineHeight: 1.3 }}>
          {jp}
        </h2>
        {note && (
          <p className="text-xs" style={{ color: MUTE }}>
            {note}
          </p>
        )}
      </div>
      <div className="mt-3" style={{ height: 1, background: HAIR }} />
    </div>
  );
}

// 画面中央ローディング
export function FullLoader({ label = "読み込み中…" }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#FAF4F2" }}
    >
      <p className="text-sm" style={{ color: MUTE }}>
        {label}
      </p>
    </div>
  );
}
