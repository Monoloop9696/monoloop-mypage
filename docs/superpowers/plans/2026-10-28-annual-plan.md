# 年間計画タブ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面に「年間計画」タブを追加し、卒年度ごとの20か月の年表に人事の活動カード（予定／実施済み／中止）とシステム内の記録を並べ、前年度の重ね表示とコピーができるようにする。

**Architecture:** 期間・位置・行割り当て・日付シフトの純粋ロジックを `src/lib/annualPlan.js` に置き node --test で検証する。画面は新規コンポーネント `src/components/AnnualPlan.jsx` に閉じ込め、AdminApp.jsx はタブ追加・props 受け渡し・共通スイッチャーの非表示・broadcasts 読込条件の4点だけ変更する。カードは `templates` に `_type:"planItem"` で保存（ルール変更なし・API なし）。

**Tech Stack:** React 18 + Vite 5 + Tailwind 3／Firebase Firestore クライアント SDK／lucide-react。テストは Node 24 標準の `node --test`。

**Spec:** `docs/superpowers/specs/2026-10-28-annual-plan-design.md`（UI の基準デモ: https://claude.ai/artifact/5zJJwdDEvNCZSs6wmcSVQ1 ）

## Global Constraints

- API ファイルを作らない（関数数 11/12）。Firestore ルール・環境変数を変えない。保存先は `templates`（管理者のみ read/write）。
- `templates` の新 `_type:"planItem"` を AdminApp.jsx の `realTemplates` の除外リストに追加する。
- 期間: `PLAN_START_MONTH = 8`、`PLAN_MONTHS = 20`。卒年度 g の年表は `new Date(g - 2, 7, 1)` から 20 か月（g-2 年 8 月 〜 g 年 3 月）。
- 前年度の重ね表示は**同じ月の列に揃える**（列インデックス＝開始月からの月数）。
- 種類と色: seminar 説明会 #4F46E5 / oc オープンカンパニー #EA580C / select 選考 BRAND（#E4007F） / follow 内定者フォロー #059947 / media 媒体・スカウト #0891B2 / campus 学内・大学 #7C3AED / other その他 #6B7280。
- 状態: plan 予定（破線枠・白地）／done 実施済み（「✓」＋塗り）／cancel 中止（取り消し線・半透明）。
- カードの表示上の最小幅は 0.95 か月。列幅は 88px。レーンの高さは `6 + rowCount * 30` px、カード高さ 26px。
- `<input type="date">` をスマホ幅の2列グリッドに入れない。時刻入力は無い。
- 年表（PC）／月リスト（スマホ）の切替は `pc` prop。
- Node は PATH に無い: `$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:PATH`。各タスクの最後に `npm run build`。push は要約提示＋承認後。

## Review Focus

1. **2/29 を含む活動を前年度からコピー**（2028-02-29 → 2029-02-28）: 無効な日付にならず 2/28 に丸める。→ Task 1 `shiftYear: うるう日は2/28に丸める`。
2. **年表の期間外の日付のカード**（例: 2028卒に 2026-07-15）: 年表には出さず、月リストにも出さない。ドロワーで開いて日付を直せるよう、期間外の件数を「期間外 N件」として見出しに出す。→ Task 1 `inCycle: 期間外は false`、Task 3 の表示条件。
3. **同じ日に同じレーンの活動が3件以上**: 行割り当てで重ならず、レーンの高さが行数に追従する。→ Task 1 `layoutRows: 同日3件は3行`。
4. **cohorts も planItem も無い次の年度**（例: 2029）: 年度候補に最大＋1 が常に出て、追加・コピーの対象にできる。→ Task 1 `planYears: 最大+1 を含む`。
5. **broadcasts が未読込のまま年間計画タブを開いた**: LINE配信レーンが空のままにならない（タブを開いたら読み込む）。→ Task 4 Step 3。

---

## File Structure

- `src/lib/annualPlan.js`（新規）: 定数とロジック。`PLAN_START_MONTH, PLAN_MONTHS, PLAN_KINDS, PLAN_STATUS, cycleStart, cycleMonths, posInCycle, inCycle, layoutRows, shiftYear, planYears, ymd`。
- `tests/annualPlan.test.mjs`（新規）。
- `src/lib/firestore.js`（変更）: `addPlanItem`（更新・削除は既存の `updateTemplate` / `deleteTemplate`）。
- `src/components/AnnualPlan.jsx`（新規）: タブ本体（上部コントロール・年表ボード・月リスト・ドロワー・コピー確認）。
- `src/pages/AdminApp.jsx`（変更）: タブ定義、`realTemplates` 除外、共通スイッチャー非表示条件、broadcasts 読込条件、描画。
- `CLAUDE.md`（変更）。

---

### Task 1: 年表ロジック（annualPlan.js）とテスト

**Files:**
- Create: `src/lib/annualPlan.js`
- Create: `tests/annualPlan.test.mjs`

**Interfaces:**
- Produces:
  - `export const PLAN_START_MONTH = 8; export const PLAN_MONTHS = 20;`
  - `export const PLAN_KINDS = { seminar:{label:"説明会", color:"#4F46E5", bg:"#EEF2FF"}, oc:{label:"オープンカンパニー", color:"#EA580C", bg:"#FFF4E5"}, select:{label:"選考", color:"#E4007F", bg:"#FCE3EF"}, follow:{label:"内定者フォロー", color:"#059947", bg:"#E7F9EE"}, media:{label:"媒体・スカウト", color:"#0891B2", bg:"#E0F7FA"}, campus:{label:"学内・大学", color:"#7C3AED", bg:"#F3E8FF"}, other:{label:"その他", color:"#6B7280", bg:"#F3F4F6"} }`（順序＝レーンの並び）
  - `export const PLAN_STATUS = { plan:"予定", done:"実施済み", cancel:"中止" }`
  - `export const ymd = (date) => "YYYY-MM-DD"`
  - `export const cycleStart = (grad) => new Date(grad - 2, PLAN_START_MONTH - 1, 1)`
  - `export const cycleMonths = (grad) => [{ y, m, key:"YYYY-MM", first:"YYYY-MM-01", last:"YYYY-MM-DD" }] × 20`
  - `export const posInCycle = (grad, dateStr) => number`（列インデックス＋月内の割合。月初＝整数）
  - `export const inCycle = (grad, dateStr) => boolean`（0 ≤ pos < 20）
  - `export const layoutRows = (items, grad, { minWidth = 0.95 } = {}) => { placed: [{ item, s, e, row }], rowCount }`（start 昇順。`e = max(pos(end)+1/30, s+minWidth)`。row は「その行の末尾 ≤ s+0.02」の最小の行）
  - `export const shiftYear = (dateStr, n) => "YYYY-MM-DD"`（2/29 → 2/28）
  - `export const planYears = ({ cohorts, items }) => number[]`（cohorts の year ∪ items の grad ∪ (max+1)、降順）

- [ ] **Step 1: テストを書く** `tests/annualPlan.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleStart, cycleMonths, posInCycle, inCycle, layoutRows, shiftYear, planYears, PLAN_MONTHS } from "../src/lib/annualPlan.js";

test("cycleStart/cycleMonths: 2028卒は2026-08から20か月で2028-03まで", () => {
  assert.equal(cycleStart(2028).getFullYear(), 2026);
  assert.equal(cycleStart(2028).getMonth(), 7);
  const ms = cycleMonths(2028);
  assert.equal(ms.length, PLAN_MONTHS);
  assert.deepEqual([ms[0].key, ms[19].key], ["2026-08", "2028-03"]);
  assert.equal(ms[5].last, "2027-01-31");
});
test("posInCycle: 月初は整数、月内は割合", () => {
  assert.equal(posInCycle(2028, "2026-08-01"), 0);
  assert.equal(posInCycle(2028, "2026-10-01"), 2);
  assert.ok(Math.abs(posInCycle(2028, "2026-10-16") - 2.5) < 0.01);
});
test("inCycle: 期間外は false", () => {
  assert.equal(inCycle(2028, "2026-07-31"), false);
  assert.equal(inCycle(2028, "2028-03-31"), true);
  assert.equal(inCycle(2028, "2028-04-01"), false);
});
test("layoutRows: 同日3件は3行、離れた2件は同じ行", () => {
  const items = [
    { id: "a", start: "2026-10-05", end: "2026-10-05" },
    { id: "b", start: "2026-10-05", end: "2026-10-05" },
    { id: "c", start: "2026-10-05", end: "2026-10-05" },
    { id: "d", start: "2027-01-10", end: "2027-01-12" },
  ];
  const { placed, rowCount } = layoutRows(items, 2028);
  assert.equal(rowCount, 3);
  const rowOf = (id) => placed.find((p) => p.item.id === id).row;
  assert.deepEqual([rowOf("a"), rowOf("b"), rowOf("c"), rowOf("d")], [0, 1, 2, 0]);
  assert.ok(placed[0].e - placed[0].s >= 0.95);
});
test("shiftYear: うるう日は2/28に丸める", () => {
  assert.equal(shiftYear("2028-02-29", 1), "2029-02-28");
  assert.equal(shiftYear("2026-10-05", 1), "2027-10-05");
  assert.equal(shiftYear("2027-03-31", -1), "2026-03-31");
});
test("planYears: 最大+1 を含む、降順、重複なし", () => {
  assert.deepEqual(planYears({ cohorts: [{ year: 2027 }, { year: 2028 }], items: [{ grad: 2027 }] }), [2029, 2028, 2027]);
  assert.deepEqual(planYears({ cohorts: [], items: [] }), [new Date().getFullYear() + 2]);
});
```

- [ ] **Step 2: 失敗を確認** Run: `npm test` → Expected: FAIL（モジュールが無い）
- [ ] **Step 3: `src/lib/annualPlan.js` を Interfaces どおり実装**（`planYears` が空のときは `今年+2` を1件返す）
- [ ] **Step 4: `npm test`** → Expected: 全 PASS（既存の specialRoute 7件＋本タスク 6件）
- [ ] **Step 5: Commit** `git add src/lib/annualPlan.js tests/annualPlan.test.mjs && git commit -m "年間計画の年表ロジック（期間・位置・行割り当て・日付シフト）とテストを追加"`

---

### Task 2: Firestore ヘルパーと除外

**Files:**
- Modify: `src/lib/firestore.js`（`addSpecialSlot` の下）
- Modify: `src/pages/AdminApp.jsx`（`const realTemplates =` の行）

**Interfaces:**
- Produces: `export async function addPlanItem({ grad, kind, title, start, end, status = "plan", owner = "", memo = "" }) → Promise<id>`（`_type:"planItem"`, `createdAt`/`updatedAt: serverTimestamp()` を付けて addDoc）。更新は `updateTemplate(id, { ...patch, updatedAt: serverTimestamp() })` を呼ぶ側で行うため、`export const touchPlanItem = (id, patch) => updateTemplate(id, { ...patch, updatedAt: serverTimestamp() })` も用意する。削除は `deleteTemplate`。

- [ ] **Step 1: `addPlanItem` / `touchPlanItem` を追加**
- [ ] **Step 2: `realTemplates` の除外に `&& t._type !== "planItem"` を追加**
- [ ] **Step 3: `npm run build`** → Expected: `✓ built`
- [ ] **Step 4: Commit** `git add src/lib/firestore.js src/pages/AdminApp.jsx && git commit -m "年間計画カードの保存ヘルパーとテンプレ一覧からの除外"`

---

### Task 3: AnnualPlan.jsx（年表・月リスト・ドロワー・コピー・自動レーン）

**Files:**
- Create: `src/components/AnnualPlan.jsx`

**Interfaces:**
- Consumes: Task 1 の全 export、Task 2 の `addPlanItem, touchPlanItem`、既存 `deleteTemplate`（firestore.js）、`useBodyScrollLock`（`../lib/scrollLock`）、`SectionTitle`（`./common`）、`BRAND, BRAND_LIGHT`（`../theme`）、lucide `X, Copy, Plus`。
- Props（Task 4 が渡す）: `{ savedTemplates, events, surveys, articles, broadcasts, cohorts, pc, setBanner, setTab, selectedYear, selectYear }`
- 内部 state: `year`（初期値 `selectedYear`）、`overlay`（true）、`showAuto`（true）、`kindOff`（Set）、`drawer`（`null | { item }`。新規は `item.id` 無し）、`copyDlg`（`null | { from, to, count }`）。
- `useBodyScrollLock(!!drawer || !!copyDlg)` を本コンポーネント内で呼ぶ。

- [ ] **Step 1: 骨組みと上部コントロール**。`items = savedTemplates.filter(t => t._type === "planItem")`。年度切替（`planYears({cohorts, items})`、既存スイッチャーと同じ見た目: 選択中は `BRAND` 塗り）／「前年度を重ねて表示」／「システムの記録も表示」／「今月へ」（PC のみ）／「前年度からコピー」／「＋ 活動を追加」／凡例（`PLAN_KINDS` のチップ＋予定/実施済み/中止の見本。種類チップは押すと `kindOff` をトグル）。空状態メッセージ（表示年度のカード 0 件）。
- [ ] **Step 2: 年表ボード（PC）**。`<Board grad isPrev>`: 見出し「{grad}卒（前年度）」＋「N件 実施済み／M件 予定」＋期間外があれば「期間外 K件」。`overflow-x:auto` の中に `grid`（`150px repeat(20, 88px)`）。ヘッダ行は月名＋先頭と1月に西暦。今月の列は `#FFF3E0`。各種類レーン: `layoutRows(items.filter(kind && inCycle), grad)` → カード `<button>` を `left: s*88+2px, width: (e-s)*88-4px, top: 4+row*30`。レーン名列は `position:sticky; left:0`。初期表示で今月の列が見える位置へ `scrollLeft`（`todayPos*88 - 220`）。
- [ ] **Step 3: 月リスト（スマホ）**。`cycleMonths(grad)` ごとにカード（`c.start <= last && c.end >= first`）と記録を行で並べる。今月の枠を `#F59E0B` の枠線＋「今月」ラベル。`id="ml-plan-this-month"` を付けて「今月へ」でスクロール。
- [ ] **Step 4: ドロワー**（面談記録ドロワーと同じ構造: `fixed inset-0 z-[65]`、右寄せ、PC は `max-w-[440px]`）。項目: 活動名（必須）／卒年度（`planYears` の select）／種類（select）／開始日・終了日（PC は2列・`min-w-0`、スマホは縦）／担当者／状態（3ボタン）／メモ（textarea）。保存: 新規は `addPlanItem`、既存は `touchPlanItem`。終了日 < 開始日なら終了日＝開始日に補正。削除は「この活動を削除」→ 確認（ボタンが「削除する／取消」に変わる）→ `deleteTemplate`。失敗は `setBanner`。
- [ ] **Step 5: 自動レーン**（`showAuto` のとき、種類レーンの下に灰色で）。
  - イベント: `events.filter(e => e.published !== false && e.grad === grad && e.dateStr && inCycle(grad, e.dateStr))` → クリックで `selectYear(grad); setTab("dash")`。
  - アンケート: `surveys.filter(s => s.published !== false && s.interview !== true && s.grad === grad)`、日付は `s.dueDate || ymd(s.createdAt.toDate())`、pulse は「パルス調査：{title}」→ `dash`。
  - 記事: `articles.filter(a => a.published !== false && (a.grad == null || a.grad === grad))`、日付は `publishAt || createdAt`（Timestamp → `ymd`）→ `news`。
  - LINE配信: `broadcasts.filter(b => b.grad === grad && b.sentAt)`、表示は `b.target` → `line`。
  - 面談: `savedTemplates.filter(t => t._type === "meeting" && (t.grad || grad) === grad)` を月ごとに件数「N件」→ `meet`。
  - 説明会・OC: `savedTemplates.filter(t => t._type === "specialSlot")`（grad なし・全年度）、表示「説明会 14:00」「OC 10:00」→ `special`。
  - いずれも `layoutRows` で行割り当て（面談は1行固定）。
- [ ] **Step 6: 前年度の重ね表示とコピー**。`overlay && planYears に year-1 がある` なら `<Board grad={year-1} isPrev>` を下に描画（カードは `filter: saturate(.6)`）。「前年度からコピー」: `from = year-1` のカードのうち `status !== "cancel"` を数えて `copyDlg` を開く。確認モーダル文: 「{from}卒の活動 {count}件を {year}卒に「予定」として追加します。日付は1年後ろにずらし、メモは引き継ぎません。すでにコピー済みでも重複して追加されます。」→ 実行で順に `addPlanItem({ grad: year, kind, title, start: shiftYear(start,1), end: shiftYear(end,1), status:"plan", owner, memo:"" })`。完了で `setBanner("{count}件を追加しました")`。count 0 なら「コピーできる活動がありません」。
- [ ] **Step 7: `npm run build`** → Expected: `✓ built`（Task 4 で組み込むまで未使用の警告は出ない。import されていないだけ）
- [ ] **Step 8: Commit** `git add src/components/AnnualPlan.jsx && git commit -m "年間計画タブの画面（年表・月リスト・活動ドロワー・前年度コピー・システム記録の表示）を追加"`

---

### Task 4: AdminApp への組み込み

**Files:**
- Modify: `src/pages/AdminApp.jsx`（import、`tabs` 配列（`{ key: "meet" ...}` の直後）、broadcasts 読込の useEffect（`if (tab === "line")`）、共通スイッチャーのブロック（`cohorts.length === 0 && ... 卒年度未登録` を含む `<div>` と「学生画面」ボタン）、タブ描画（`{tab === "special" && (` の直前）

**Interfaces:**
- Consumes: Task 3 の `AnnualPlan`（default export）と props 一覧。AdminBody にある `selectYear`（既存。`setSelectedYear` ＋ 展開状態のリセット）、`articles`, `broadcasts`, `cohorts`, `setTab`。

- [ ] **Step 1: `import AnnualPlan from "../components/AnnualPlan";` と lucide の `CalendarRange` を追加。`tabs` に `{ key: "plan", label: "年間計画", icon: CalendarRange }` を「面談」の直後に追加**
- [ ] **Step 2: 描画: `{tab === "plan" && (<AnnualPlan savedTemplates={savedTemplates} events={events} surveys={surveys} articles={articles} broadcasts={broadcasts} cohorts={cohorts} pc={pc} setBanner={setBanner} setTab={setTab} selectedYear={selectedYear} selectYear={selectYear} />)}`**
- [ ] **Step 3: broadcasts 読込: `if (tab === "line")` の useEffect とは別に `useEffect(() => { if (tab === "plan") refreshBroadcasts(); }, [tab])` を追加**（Review Focus 5）
- [ ] **Step 4: 共通の年度スイッチャー＋「学生画面」ボタンのブロックを `tab !== "plan" && (...)` で囲む**（ブロックの開始・終了タグを確認して囲む。他タブの表示は変えない）
- [ ] **Step 5: `npm run build`** → Expected: `✓ built`
- [ ] **Step 6: 画面確認**（管理者ログインが必要。できない場合は「未確認」と報告）。できる場合: タブが出る／年度切替／活動を追加→カードが出る→実施済みに切替／前年度からコピー／スマホ表示で月リスト。
- [ ] **Step 7: Commit** `git add src/pages/AdminApp.jsx && git commit -m "管理画面に「年間計画」タブを追加"`

---

### Task 5: CLAUDE.md 更新・最終確認

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 3章（`components/AnnualPlan.jsx`・`lib/annualPlan.js`）、4章（`planItem` のフィールド）、8章（管理: 年間計画タブの説明＝年表の軸・カード・自動レーン・前年度コピー・年度候補に最大+1）、9章（直近の追加に1行、「運用で確認」に実機確認項目）を追記**
- [ ] **Step 2: `npm test` と `npm run build`** → Expected: 全 PASS／`✓ built`
- [ ] **Step 3: Commit** `git add CLAUDE.md && git commit -m "docs: 年間計画タブを CLAUDE.md に反映"`
- [ ] **Step 4: 変更内容の要約を提示し、承認後に `git push origin main`。反映後、本番 JS に「年間計画」が含まれることを curl で確認。**
