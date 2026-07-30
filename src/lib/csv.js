// CSV 生成＆ダウンロード（管理者のみ利用）。Excel を考慮し BOM 付き UTF-8。
function escapeCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename, rows) {
  const csv = "﻿" + toCsv(rows); // Excel 用 UTF-8 BOM
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
