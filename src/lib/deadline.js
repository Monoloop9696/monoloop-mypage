// 締切の判定・表示。日付（YYYY-MM-DD）に加えて、任意で時刻（HH:MM）も指定できる。
// 時刻が未指定のときは「その日いっぱい（23:59:59）」を締切とみなす。

const isTime = (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);

// 締切を過ぎているか（dateStr が無ければ締切なし＝false）
export function pastDeadline(dateStr, timeStr, now = new Date()) {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T${isTime(timeStr) ? `${timeStr}:00` : "23:59:59"}`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

// 「8/21 18:00 まで」のような表示用ラベル
export function deadlineText(dateStr, timeStr, emptyLabel = "追ってご案内") {
  if (!dateStr) return emptyLabel;
  const md = `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;
  return `${md}${isTime(timeStr) ? ` ${timeStr}` : ""} まで`;
}
