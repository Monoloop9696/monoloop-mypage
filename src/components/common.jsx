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

// 時刻入力：「時」と「分」を別々のプルダウンで選ぶ（ブラウザ標準の time 入力は操作しづらいため）。
//   value / onChange は "HH:MM"（未選択は ""）
//   step      分の刻み（既定5分）
//   min / max 選べる範囲 "HH:MM"（面談の開始時刻を希望の時間帯に収める等）
//   allowEmpty 未選択（--）を許すか
export function TimeSelect({
  value, onChange, disabled = false, step = 5, min, max, allowEmpty = true,
  selectClassName = "border border-gray-300 rounded-lg px-2 py-2.5 text-sm bg-white disabled:bg-gray-50",
  selectStyle,
}) {
  const isTime = (t) => /^\d{2}:\d{2}$/.test(t || "");
  const toMin = (t) => (isTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const p2 = (n) => String(n).padStart(2, "0");
  const curH = isTime(value) ? value.slice(0, 2) : "";
  const curM = isTime(value) ? value.slice(3, 5) : "";
  const lo = toMin(min) ?? 0;
  const hi = toMin(max) ?? 23 * 60 + 59;

  const hours = [];
  for (let H = 0; H < 24; H++) if (H * 60 + 59 >= lo && H * 60 <= hi) hours.push(p2(H));
  if (curH && !hours.includes(curH)) { hours.push(curH); hours.sort(); }

  const minutesOf = (H) => {
    const out = [];
    for (let M = 0; M < 60; M += step) {
      const t = Number(H) * 60 + M;
      if (t >= lo && t <= hi) out.push(p2(M));
    }
    return out;
  };
  const mins = curH ? minutesOf(curH) : [];
  // 刻みに合わない既存の値（例 10:07）もそのまま選べるように残す
  if (curM && !mins.includes(curM)) { mins.push(curM); mins.sort(); }

  const setHour = (H) => {
    if (!H) { onChange(""); return; }
    const opts = minutesOf(H);
    onChange(`${H}:${opts.includes(curM) ? curM : (opts[0] || "00")}`);
  };
  const setMin = (M) => { if (curH) onChange(`${curH}:${M}`); };

  return (
    <div className="flex items-center gap-1">
      <select value={curH} onChange={(e) => setHour(e.target.value)} disabled={disabled} aria-label="時"
        className={`flex-1 min-w-0 ${selectClassName}`} style={selectStyle}>
        {(allowEmpty || !curH) && <option value="">--時</option>}
        {hours.map((H) => (<option key={H} value={H}>{Number(H)}時</option>))}
      </select>
      <select value={curM} onChange={(e) => setMin(e.target.value)} disabled={disabled || !curH} aria-label="分"
        className={`flex-1 min-w-0 ${selectClassName}`} style={selectStyle}>
        {!curH && <option value="">--分</option>}
        {mins.map((M) => (<option key={M} value={M}>{M}分</option>))}
      </select>
    </div>
  );
}
