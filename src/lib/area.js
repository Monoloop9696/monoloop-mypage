// 住所（都道府県で始まる文字列）からエリア（地方区分）を判定するユーティリティ。
// 登録住所は自由入力のため、先頭の都道府県名で判定する（例：「愛知県名古屋市…」→ 東海）。

export const AREAS = [
  { key: "hokkaido", label: "北海道", prefs: ["北海道"] },
  { key: "tohoku", label: "東北", prefs: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { key: "kanto", label: "関東", prefs: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { key: "koshinetsu", label: "甲信越", prefs: ["新潟県", "山梨県", "長野県"] },
  { key: "hokuriku", label: "北陸", prefs: ["富山県", "石川県", "福井県"] },
  { key: "tokai", label: "東海", prefs: ["岐阜県", "静岡県", "愛知県", "三重県"] },
  { key: "kinki", label: "関西", prefs: ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { key: "chugoku", label: "中国", prefs: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] },
  { key: "shikoku", label: "四国", prefs: ["徳島県", "香川県", "愛媛県", "高知県"] },
  { key: "kyushu", label: "九州・沖縄", prefs: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
];

const PREF_AREA = [];
for (const a of AREAS) for (const p of a.prefs) PREF_AREA.push([p, a.key]);

export function areaLabel(key) {
  const a = AREAS.find((x) => x.key === key);
  return a ? a.label : "";
}

// 住所文字列 → エリアキー（判定不可なら null）
export function addressArea(address) {
  if (!address) return null;
  const s = String(address).trim();
  for (const [pref, key] of PREF_AREA) if (s.startsWith(pref)) return key;
  // 「県/府/都」を省いた語幹でも前方一致を試す（例：「愛知名古屋市」）
  for (const [pref, key] of PREF_AREA) {
    const stem = pref.replace(/[都道府県]$/, "");
    if (stem && s.startsWith(stem)) return key;
  }
  return null;
}

// 学生が対象エリア集合に含まれるか。basis: "current"=現住所 / "home"=実家 / "either"=どちらか
export function matchesAreas(student, areas, basis = "either") {
  if (!areas || areas.length === 0) return true; // 指定なし＝全員
  const cur = addressArea(student && student.address);
  const home = student && student.livesAtHome ? cur : addressArea(student && student.homeAddress);
  const set = new Set(areas);
  const curOk = !!cur && set.has(cur);
  const homeOk = !!home && set.has(home);
  if (basis === "current") return curOk;
  if (basis === "home") return homeOk;
  return curOk || homeOk;
}
