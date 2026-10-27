# 特別選考の候補日程／面談記録のスクリーンショット／流入経路表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 特別選考LPで説明会／OCの候補日程を複数選んでエントリーでき、人事が管理画面で日程の登録・確定（確定メール送信）を行える。面談記録にスクリーンショットを貼れ、面談記録の内定者表示に流入経路が出る。

**Architecture:** 日程・エントリー・面談画像はすべて既存の `templates` コレクションに置き（ルール変更なし）、未ログインの学生は `api/public-cohorts.js` の action 分岐経由で読み書きする（Vercel 関数数 11 を維持）。日程に関する純粋ロジック（表示・絞り込み・検証）は `src/lib/specialRoute.js` に集約し、API もそこから import して LP／API／管理画面の判定を一致させる。画像は `image.js` で縮小した dataURL を面談記録ドキュメントに同居させる。

**Tech Stack:** React 18 + Vite 5 + Tailwind 3／Firebase（Firestore, Admin SDK）／Vercel Serverless／Resend。テストは Node 24 標準の `node --test`（追加パッケージなし）。

**Spec:** `docs/superpowers/specs/2026-10-27-special-slots-screenshot-source-design.md`

## Global Constraints

- 新しい API ファイルは作らない（Vercel Hobby は関数 12 個まで。現在 11）。
- Firestore ルール・環境変数は変更しない。新データはすべて `templates` コレクション（管理者のみ read/write）。
- `templates` に新しい `_type` を足したら、AdminApp.jsx の `realTemplates` の除外リストに追加する（`specialSlot` を追加）。
- `<input type="date">` をスマホ幅の2列グリッドに入れない（親に `min-w-0`、スマホは縦並び）。時刻入力は `TimeSelect`（`src/components/common.jsx`）。
- ルート→日程種別の対応: `special1 → "seminar"`、`special2 → "oc"`、`casual → null`。
- 日程の表示形式: `10/15（水）14:00〜15:00`（曜日は日本語1文字・全角括弧・時刻は `〜` で結ぶ）。
- 画像: `fileToCompressedDataURL(file, { maxDim: 480, quality: 0.75, maxLen: 70000 })`、1記録 最大 2 枚。
- 確定メール件名: `【モノ・ループ】{説明会|オープンカンパニー}の日程が確定しました`。
- Node は PATH に無い。コマンド前に `$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:PATH`（PowerShell）。
- 各タスクの最後に `npm run build` が通ること。push は要約提示＋承認後（CLAUDE.md 6章）。コミットはローカルで都度行う。

## Review Focus

1. **残り 0（満員）の枠を選んで送信された**（LP を開いたあとに満員になった）: サーバーが黙って除外し、残り 0 件かつ別日希望なしなら 400 を返す。→ Task 1 のテスト `validateSlotSelection: 満員の枠は除外される`。
2. **日付が過ぎた枠**: LP には出ない。管理画面の確定プルダウンには「候補に印が付いている／すでに確定済み」のときだけ出す。→ Task 1 のテスト `selectableSlots: 今日より前の枠は除外`、Task 5 の確認手順。
3. **別日希望のみ（候補 0 件）で再エントリー → 人事が確定 → 学生がまたルートを変えて再エントリー**: confirmedSlotId は種別が変わったときだけ null に戻る。→ Task 2 の e2e 手順。
4. **画像以外をクリップボードから貼り付けた**（テキスト等）: 何も起きない（エラーも出さない）。→ Task 7 の実装条件と確認手順。
5. **大きなスクリーンショット（4K）を貼った**: `maxLen` に収まるまで品質を下げ、それでも超えたらエラー表示して取り込まない。→ Task 7 の確認手順。

---

## File Structure

- `src/lib/specialRoute.js`（変更）: 日程の純粋ロジックを追加。`SLOT_KINDS`, `slotKindForRoute`, `formatSlotLabel`, `selectableSlots`, `validateSlotSelection`, `weekdayJa`。
- `tests/specialRoute.test.mjs`（新規）: 上記のテスト。`package.json` に `"test": "node --test tests/"`。
- `api/public-cohorts.js`（変更）: `action=specialSlots` / `specialEntry` 拡張 / `action=specialConfirm`。
- `src/lib/api.js`（変更）: `specialSlots(kind)`, `specialConfirm(payload)`。
- `src/lib/firestore.js`（変更）: `addSpecialSlot(data)`。
- `src/components/SpecialAdmin.jsx`（変更）: 日程区画・エントリーカードの候補／確定・確定ダイアログ・フィルター・CSV。
- `src/pages/SpecialEntry.jsx`（変更）: 候補日程の設問・送信条件・完了画面。
- `src/pages/AdminApp.jsx`（変更）: `realTemplates` 除外、面談記録ドロワーの画像貼り付け、画像表示4か所＋拡大モーダル、内定者表示の流入経路。
- `CLAUDE.md`（変更）: 4章・8章・9章。

---

### Task 1: 日程の純粋ロジック（specialRoute.js）とテスト

**Files:**
- Modify: `src/lib/specialRoute.js`（末尾に追加）
- Create: `tests/specialRoute.test.mjs`
- Modify: `package.json`（scripts に `"test": "node --test tests/"`）

**Interfaces:**
- Produces:
  - `export const SLOT_KINDS = { seminar: "説明会", oc: "オープンカンパニー" }`
  - `export const slotKindForRoute = (routeId) => "seminar" | "oc" | null`
  - `export const weekdayJa = (dateStr /* YYYY-MM-DD */) => "日"|"月"|...|"土"`
  - `export const formatSlotLabel = (slot /* {date,start,end} */) => string`　例 `"10/15（水）14:00〜15:00"`。`end` が空なら `"10/15（水）14:00"`。
  - `export const isSlotFull = (slot) => slot.remaining === 0`（`null`/`undefined` は満員ではない）
  - `export const selectableSlots = (slots, { kind, today }) => slot[]`　`active !== false` かつ `kind` 一致かつ `date >= today`、`date, start` 昇順。満員は含める（表示側で disabled にする）。
  - `export const validateSlotSelection = ({ routeId, slotIds, otherDate, slots, today }) => { ok: true, slotIds: string[] } | { ok: false, error: string }`
    - `routeId` が casual（kind が null）→ `{ ok:true, slotIds: [] }`。
    - `slots` を `selectableSlots` で絞り、さらに満員を除外した集合に含まれる id だけ残す。
    - 公開中の枠（`selectableSlots` の結果）が 0 件 → `{ ok:true, slotIds: [] }`（設問を出さないケース）。
    - 残った id が 0 件かつ `otherDate !== true` → `{ ok:false, error: "候補日程を選ぶか、別日での調整を希望してください。" }`。
  - `export const todayJst` は既存のまま使う。

- [ ] **Step 1: テストを書く** `tests/specialRoute.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotKindForRoute, weekdayJa, formatSlotLabel, isSlotFull, selectableSlots, validateSlotSelection } from "../src/lib/specialRoute.js";

const S = (o) => ({ id: "x", kind: "seminar", date: "2026-11-05", start: "14:00", end: "15:00", remaining: null, active: true, ...o });

test("slotKindForRoute", () => {
  assert.equal(slotKindForRoute("special1"), "seminar");
  assert.equal(slotKindForRoute("special2"), "oc");
  assert.equal(slotKindForRoute("casual"), null);
});
test("formatSlotLabel: 2026-10-15 は水曜", () => {
  assert.equal(weekdayJa("2026-10-15"), "水");
  assert.equal(formatSlotLabel({ date: "2026-10-15", start: "14:00", end: "15:00" }), "10/15（水）14:00〜15:00");
  assert.equal(formatSlotLabel({ date: "2026-10-15", start: "14:00", end: "" }), "10/15（水）14:00");
});
test("isSlotFull: 0 だけ満員", () => {
  assert.equal(isSlotFull(S({ remaining: 0 })), true);
  assert.equal(isSlotFull(S({ remaining: null })), false);
  assert.equal(isSlotFull(S({ remaining: 3 })), false);
});
test("selectableSlots: 今日より前の枠・停止中・種別違いは除外、日付順", () => {
  const slots = [
    S({ id: "a", date: "2026-11-05", start: "16:00" }),
    S({ id: "b", date: "2026-11-05", start: "10:00" }),
    S({ id: "old", date: "2026-10-01" }),
    S({ id: "off", active: false }),
    S({ id: "oc", kind: "oc" }),
    S({ id: "full", remaining: 0, date: "2026-11-06" }),
  ];
  assert.deepEqual(selectableSlots(slots, { kind: "seminar", today: "2026-10-27" }).map((s) => s.id), ["b", "a", "full"]);
});
test("validateSlotSelection: 満員の枠は除外される", () => {
  const slots = [S({ id: "ok" }), S({ id: "full", remaining: 0 })];
  assert.deepEqual(validateSlotSelection({ routeId: "special1", slotIds: ["ok", "full", "nope"], otherDate: false, slots, today: "2026-10-27" }), { ok: true, slotIds: ["ok"] });
  assert.equal(validateSlotSelection({ routeId: "special1", slotIds: ["full"], otherDate: false, slots, today: "2026-10-27" }).ok, false);
  assert.deepEqual(validateSlotSelection({ routeId: "special1", slotIds: ["full"], otherDate: true, slots, today: "2026-10-27" }), { ok: true, slotIds: [] });
});
test("validateSlotSelection: casual と公開枠なしは常に ok", () => {
  assert.deepEqual(validateSlotSelection({ routeId: "casual", slotIds: ["ok"], otherDate: false, slots: [S()], today: "2026-10-27" }), { ok: true, slotIds: [] });
  assert.deepEqual(validateSlotSelection({ routeId: "special1", slotIds: [], otherDate: false, slots: [], today: "2026-10-27" }), { ok: true, slotIds: [] });
});
```

- [ ] **Step 2: 失敗を確認** Run: `npm test` → Expected: FAIL（export が無い）
- [ ] **Step 3: `src/lib/specialRoute.js` 末尾に Interfaces の関数を実装**（`weekdayJa` は `new Date(dateStr + "T00:00:00")` の `getDay()`。`formatSlotLabel` の月日は先頭ゼロなし）
- [ ] **Step 4: `package.json` の scripts に `"test": "node --test tests/"` を追加し、`npm test` → Expected: 全 PASS**
- [ ] **Step 5: Commit** `git add src/lib/specialRoute.js tests/specialRoute.test.mjs package.json && git commit -m "特別選考の日程ロジック（種別・表示・絞り込み・検証）とテストを追加"`

---

### Task 2: 公開 API（specialSlots / specialEntry 拡張 / specialConfirm）

**Files:**
- Modify: `api/public-cohorts.js`
- Modify: `src/lib/api.js`（`specialVerify` の下）

**Interfaces:**
- Consumes: Task 1 の `slotKindForRoute, formatSlotLabel, selectableSlots, validateSlotSelection, SLOT_KINDS`（`import { ... } from "../src/lib/specialRoute.js"`）。`requireAdmin` は `./_lib/util.js` にある（戻り値は decoded token。`null` なら 403）。
- Produces:
  - `POST /api/public-cohorts {action:"specialSlots", kind}` → `200 { slots: [{id,date,start,end,note,remaining}] }`（`selectableSlots` を通したもの。`kind` が不正なら `slots: []`）
  - `POST ... {action:"specialEntry", ..., slotIds:[], otherDate:boolean}` → 既存どおり `200 {ok:true, mailSent}`。保存フィールドに `slotIds, otherDate, confirmedSlotId, confirmedAt, confirmMailAt` を追加。
  - `POST ... {action:"specialConfirm", entryId, slotId|null, sendMail:boolean}`（Authorization: Bearer 管理者 ID トークン）→ `200 { ok:true, mailSent:boolean }`／`403`／`404`（entry か slot が無い）。
  - `src/lib/api.js`: `export const specialSlots = (kind) => post("/api/public-cohorts", { action: "specialSlots", kind });`　`export const specialConfirm = (payload) => post("/api/public-cohorts", { action: "specialConfirm", ...payload }, { authed: true });`

- [ ] **Step 1: `specialSlots(res, body)` を追加**。`templates` を `where("_type","==","specialSlot")` で取得し `selectableSlots(docs, { kind: body.kind, today: todayJst() })` を返す。返すキーは Interfaces の6つのみ。
- [ ] **Step 2: `specialEntry` を拡張**
  - 既存の検証のあとに `const kind = slotKindForRoute(route)`。kind があれば `specialSlot` 全件を取得し `validateSlotSelection({ routeId: route, slotIds: body.slotIds, otherDate: body.otherDate === true, slots, today })`。`ok:false` なら `400 { error }`。
  - payload に `slotIds`（検証後）, `otherDate`（kind が null なら false）を追加。
  - 再エントリー（`prev.exists`）のとき: `slotKindForRoute(prev.data().route) !== kind` なら `confirmedSlotId: null, confirmedAt: null, confirmMailAt: null` を payload に含める（同じ種別なら触らない）。新規は3つとも `null`。
  - 本人メール・管理者メールの本文に、`slotIds` を `formatSlotLabel` で列挙した「▼ ご希望の候補日程」ブロック（別日希望なら「別日での調整を希望」）＋「日程は人事からご連絡します。」を追加。候補も別日希望も無い（casual／公開枠なし）ときはブロックを出さない。
- [ ] **Step 3: `specialConfirm(req, res, body)` を追加**
  - `const admin = await requireAdmin(req); if (!admin) return sendJson(res, 403, { error: "権限がありません。" });`
  - entry（`_type:"specialEntry"`）を取得、無ければ 404。`slotId` があれば slot（`_type:"specialSlot"`）を取得、無ければ 404。
  - 更新: `confirmedSlotId: slotId || null, confirmedAt: slotId ? serverTimestamp : null`。`slotId` があり `status` が `"未対応"` か `"連絡済"` なら `status: "日程調整済"`。
  - `slotId && sendMail` のとき Resend で本人へ送る。件名は Global Constraints。本文: `{name}さん`／ルート名／`確定した日程：{formatSlotLabel(slot)}`／`note` があれば1行／「変更が必要な場合はこのメールに返信してください。」／署名。成功時 `confirmMailAt: serverTimestamp`。失敗は `mailSent:false`（更新は成功）。
  - `handler` の分岐に `if (body.action === "specialConfirm") return await specialConfirm(req, res, body);` を追加。
- [ ] **Step 4: `src/lib/api.js` に Interfaces の2関数を追加**
- [ ] **Step 5: 構文確認** Run: `node --check api/public-cohorts.js` → Expected: エラーなし
- [ ] **Step 6: ローカル e2e（devApiPlugin 経由）**。別ターミナルで `npm run dev` を起動し:
  - `curl -s -X POST localhost:5173/api/public-cohorts -H "Content-Type: application/json" -d '{"action":"specialSlots","kind":"seminar"}'` → Expected: `{"slots":[...]}`（配列）
  - `... -d '{"action":"specialConfirm","entryId":"x","slotId":null,"sendMail":false}'`（認証なし）→ Expected: 403
  - `... -d '{"action":"specialEntry","code":"NOPE","route":"special1",...}'` → Expected: 400（コード不正。既存どおり）
  - Review Focus 3 の確認は Task 5 完了後に管理画面＋LP で行う（Task 5 Step 8）。
- [ ] **Step 7: Commit** `git add api/public-cohorts.js src/lib/api.js && git commit -m "特別選考API：候補日程の取得・エントリーへの候補保存・確定（メール送信）を追加"`

---

### Task 3: Firestore ヘルパーと realTemplates の除外

**Files:**
- Modify: `src/lib/firestore.js`（`setSpecialCode` の下）
- Modify: `src/pages/AdminApp.jsx`（`realTemplates` の行）

**Interfaces:**
- Produces: `export async function addSpecialSlot({ kind, date, start, end, note, remaining }) → Promise<id>`（`_type:"specialSlot", active:true, createdAt: serverTimestamp()` を付けて `addDoc`。`remaining` は `Number` か `null`）。更新・削除は既存の `updateTemplate(id, patch)` / `deleteTemplate(id)`。

- [ ] **Step 1: `addSpecialSlot` を追加**
- [ ] **Step 2: `realTemplates` のフィルタに `&& t._type !== "specialSlot"` を追加**
- [ ] **Step 3: `npm run build`** → Expected: `✓ built`
- [ ] **Step 4: Commit** `git add src/lib/firestore.js src/pages/AdminApp.jsx && git commit -m "特別選考の日程ドキュメントの追加ヘルパーとテンプレ一覧からの除外"`

---

### Task 4: 管理画面「説明会・OCの日程」区画と確定フロー（SpecialAdmin.jsx）

**Files:**
- Modify: `src/components/SpecialAdmin.jsx`

**Interfaces:**
- Consumes: Task 1 の `SLOT_KINDS, slotKindForRoute, formatSlotLabel, isSlotFull, selectableSlots, todayJst`、Task 2 の `specialConfirm`、Task 3 の `addSpecialSlot`、既存 `updateTemplate, deleteTemplate`、`TimeSelect`（`./common`）。
- Produces: なし（画面のみ）。state 名: `slots`（useMemo: `_type:"specialSlot"` を date,start 昇順）、`ns`（追加フォーム `{kind:"seminar", date:"", start:"", end:"", note:"", remaining:""}`）、`confirmDlg`（`{ entry, slotId, sendMail:true } | null`）、`fSlot`（フィルター）。

- [ ] **Step 1: 日程区画を「特別コード」区画の直後（`スカウト文面の例` の前）に追加**
  - 追加フォーム: 種別 select（`SLOT_KINDS`）／日付 `type="date"`／`TimeSelect`×2（開始・終了）／残り人数 `type="number" min=0`（空欄可）／補足 text／「追加」。レイアウトは `pc ? "grid grid-cols-2 gap-2" : "space-y-2"`、各セルに `min-w-0`。日付・開始が空なら送らない（エラー文「日付と開始時刻を入力してください。」）。
  - 一覧（日付順、今日より前は末尾で薄く）: `formatSlotLabel` ＋ `SLOT_KINDS[kind]` チップ＋`note`／残り人数（`type="number"` の小さな入力。blur で `updateTemplate(id, { remaining: v === "" ? null : Number(v) })`。満員は赤字「満員」）／`希望{n}名・確定{m}名`（n = entries の `slotIds` に含む件数、m = `confirmedSlotId === id` の件数）／「停止する／再開する」／「削除」（候補に持つエントリーが n 件あれば「{n}件のエントリーが候補にしています。削除しますか？」の確認）。
- [ ] **Step 2: エントリーカードに日程の行を追加**（`e.route` の kind が null で `otherDate` も無ければ出さない）
  - 候補チップ: `e.slotIds` を `slots` から引いて `formatSlotLabel`。見つからない id は「（削除済みの枠）」。`e.otherDate` なら琥珀チップ「別日で調整を希望」。
  - 確定表示: `e.confirmedSlotId` があれば緑バッジ「確定 {label}」＋ `e.confirmMailAt` があれば「案内メール送信済 {fmt(e.confirmMailAt)}」。枠が無ければ「（削除済みの枠）」、`active===false` なら「（停止中）」を添える。
  - 「確定する日程」select: 選択肢は「未確定」＋ `slots.filter(s => s.kind === kind && (s.active !== false && s.date >= todayJst()) || e.slotIds.includes(s.id) || s.id === e.confirmedSlotId)`。候補に含まれる枠は label 末尾に「（希望）」を付けて先頭に並べる。変更時は即保存せず `setConfirmDlg({ entry: e, slotId: value || null, sendMail: !!value })`。
- [ ] **Step 3: 確定ダイアログ**（`confirmDlg` が truthy のとき、既存モーダルと同じ `fixed inset-0 z-[80]` 構造）: 学生名／確定する日程（null なら「未確定に戻す」）／チェック「確定後に学生へメールで案内を送る」（`slotId` が null なら非表示）／「確定する」→ `specialConfirm({ entryId, slotId, sendMail })`。結果 `mailSent === false` かつ sendMail なら `setBanner("日程は確定しましたが、案内メールを送れませんでした。")`。閉じる。
- [ ] **Step 4: フィルター「日程」select（全日程／各 `formatSlotLabel`）を既存3つの横に追加**。条件: `e.slotIds?.includes(fSlot) || e.confirmedSlotId === fSlot`。
- [ ] **Step 5: CSV に「候補日程」（`、` 区切り）「別日希望」（`希望`/空）「確定日程」の3列を追加**（「対応状況」の前）。
- [ ] **Step 6: `npm run build`** → Expected: `✓ built`
- [ ] **Step 7: 画面確認**（管理者ログインが必要。できない場合は「未確認」と報告）: 日程を1件追加 → 残り人数を 0 に → 一覧に「満員」。
- [ ] **Step 8: Commit** `git add src/components/SpecialAdmin.jsx && git commit -m "特別選考タブ：説明会・OCの日程登録、エントリーの候補表示と日程確定（案内メール）を追加"`

---

### Task 5: LP の候補日程の設問（SpecialEntry.jsx）

**Files:**
- Modify: `src/pages/SpecialEntry.jsx`（`pickRoute` 付近、`submit`、`step === 2` のフォーム先頭、`step === 3` の完了画面）

**Interfaces:**
- Consumes: Task 1 の `slotKindForRoute, formatSlotLabel, isSlotFull, SLOT_KINDS`、Task 2 の `specialSlots(kind)`。
- state: `slotList`（`[]`）、`slotLoading`、`pickedSlots`（`Set<string>`）、`otherDate`（false）。

- [ ] **Step 1: ルート選択時に候補を取得**。`pickRoute(r)` 内で `const kind = slotKindForRoute(r.id)`; kind があれば `specialSlots(kind).then(({slots}) => setSlotList(slots))`、無ければ `setSlotList([])`。`pickedSlots` と `otherDate` はリセット。
- [ ] **Step 2: フォーム先頭（「確認済」行の直後）に設問を描画**（`kind` があるときだけ）
  - 見出し `{SLOT_KINDS[kind]}の候補日程` ＋ `req`。説明「都合のよい日程にすべて印を付けてください。」
  - `slotList.length === 0`（読込後）: 設問の代わりに「日程は人事からご連絡します。」の1行。
  - 各枠: `<label>` にチェックボックス＋ `formatSlotLabel(s)` ＋ `note` ＋ 残り表示（`remaining == null` なら無し、`isSlotFull` なら赤字「満員」で `disabled`、それ以外は「残り{n}名」）。
  - 最後に「候補の中に参加できる日がない（別日で調整を希望）」チェック。オンのとき直下に「人事から別途ご連絡します。」。
- [ ] **Step 3: `submit` の検証に追加**（`kind` があり `slotList.length > 0` のとき）: `pickedSlots.size === 0 && !otherDate` → `setErr("候補日程を選ぶか、別日での調整を希望してください。")`。payload に `slotIds: [...pickedSlots], otherDate` を追加（kind が無ければ `[]`, `false`）。
- [ ] **Step 4: 完了画面**（`step === 3`）に「ご希望の候補日程」の一覧（または「別日での調整を希望」）と「日程は人事からご連絡します。」を追加（候補も別日希望も無ければ出さない）。
- [ ] **Step 5: `npm run build`** → Expected: `✓ built`
- [ ] **Step 6: ブラウザ確認（`npm run dev` → `/special?code=<テストコード>`）**: ①を選ぶと候補が出る／満員は押せない／何も選ばず送信でエラー／別日希望だけで送信できる。テストコードは管理画面で発行（できなければ Firestore に `templates/special_code_TEST-0001 {_type:"specialCode", code:"TEST-0001", active:true}` を手で作る）。
- [ ] **Step 7: Review Focus 3 の確認**: 候補なし・別日希望で送信 → 管理画面で確定 → 同じメールでルート②に再エントリー → 管理画面で確定が解除されている。
- [ ] **Step 8: Commit** `git add src/pages/SpecialEntry.jsx && git commit -m "特別選考LP：説明会・OCの候補日程に複数印を付けてエントリーできるように"`

---

### Task 6: 面談記録の内定者表示に流入経路（AdminApp.jsx）

**Files:**
- Modify: `src/pages/AdminApp.jsx`（面談記録ドロワーの「内定者」select、`meetHist` モーダルの見出し）

**Interfaces:**
- Produces: `const studentMeetLabel = (st) => \`${st.name}（${st.univ || "大学未登録"}）・${st.source || "流入経路 未登録"}\``（AdminBody 内のヘルパー）。

- [ ] **Step 1: `studentMeetLabel` を `meetingsOf` の近くに定義**
- [ ] **Step 2: ドロワーの `<option>` の表示を `studentMeetLabel(st)` に変更。select の直下に、選択中の学生があれば `text-xs text-gray-500` で `studentMeetLabel(st)` を表示**
- [ ] **Step 3: `meetHist` モーダルの見出し2行目を `{st.univ || "大学未登録"}・{st.source || "流入経路 未登録"}・{面談N回|未実施}` に変更**
- [ ] **Step 4: `npm run build`** → Expected: `✓ built`
- [ ] **Step 5: Commit** `git add src/pages/AdminApp.jsx && git commit -m "面談記録の内定者表示に流入経路を追加"`

---

### Task 7: 面談記録のスクリーンショット（AdminApp.jsx）

**Files:**
- Modify: `src/pages/AdminApp.jsx`（state 宣言付近 `meetHistOpen` の下、`openMeetForm`／`closeMeetForm`／`saveMeeting`、ドロワー本文、`MeetCard`、`meetHist` モーダル、内定者詳細の直近3件、モーダル群の末尾）

**Interfaces:**
- Consumes: `fileToCompressedDataURL` from `../lib/image`（既に import 済みか確認。無ければ追加）。
- Produces:
  - state: `meetShots: string[]`（編集中の画像 dataURL）、`shotView: string | null`（拡大表示）。
  - `const MEET_SHOT_MAX = 2;`、`const addMeetShot = async (file) => void`（画像でなければ何もしない。上限超過は `setMeetErr("画像は最大2枚までです。")`。圧縮失敗は `setMeetErr(ex.message)`）。
  - `const MeetShots = ({ shots, size = 72 }) => JSX`（サムネイル列。クリックで `setShotView(src)`。`shots` が空なら `null`）。
  - 面談記録ドキュメントの `shots: string[]`。

- [ ] **Step 1: state とヘルパーを追加**。`openMeetForm(m, ...)` で `setMeetShots(m?.shots || [])`、`closeMeetForm` で `setMeetShots([])`。`saveMeeting` の `data` に `shots: meetShots` を追加。
- [ ] **Step 2: ドロワーの「次回予定」の下に貼り付け枠を追加**
  - `<div tabIndex={0} onPaste={...} onDrop={...} onDragOver={e => e.preventDefault()}>`。`onPaste`: `[...e.clipboardData.items].find(i => i.type.startsWith("image/"))?.getAsFile()` が無ければ return（Review Focus 4）。あれば `e.preventDefault(); addMeetShot(file)`。
  - 枠の文言: 「ここをクリックして Ctrl+V で貼り付け（またはドラッグ＆ドロップ）」＋「ファイルを選ぶ」（`<input type="file" accept="image/*" hidden>`）。
  - 下にサムネイル（各 `×` で `setMeetShots(prev => prev.filter((_, j) => j !== i))`）。枚数表示 `{meetShots.length}/2`。
- [ ] **Step 3: 表示4か所に `<MeetShots shots={m.shots} />` を追加**: `MeetCard`（本文の下）、`meetHist` モーダルの各記録（本文の下）、内定者詳細の直近3件（`meetingsOf(d.id)` を描画している箇所）、ドロワーは Step 2 で済み。
- [ ] **Step 4: 拡大モーダル**（`shotView` が truthy。`fixed inset-0 z-[90]`、黒背景クリックで閉じる、`<img src={shotView} style={{maxWidth:"92vw", maxHeight:"85vh"}}>`）をモーダル群の末尾に追加。`useBodyScrollLock` の条件に `|| shotView` を追加。
- [ ] **Step 5: `npm run build`** → Expected: `✓ built`
- [ ] **Step 6: ブラウザ確認（管理者ログインが必要）**: Win+Shift+S で撮って貼る → サムネイルが出る／保存後に履歴モーダルに出る／テキストをコピーして貼っても何も起きない／3枚目で「最大2枚」エラー／4K のスクリーンショットでもサムネイルが出る（Review Focus 5。dataURL 長が 70000 以下であることを DevTools で確認）。
- [ ] **Step 7: Commit** `git add src/pages/AdminApp.jsx && git commit -m "面談記録にスクリーンショットを貼り付け・表示できるように（最大2枚・480px）"`

---

### Task 8: CLAUDE.md 更新と最終ビルド

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 4章に `specialSlot` と specialEntry の追加フィールド、meeting の `shots` を追記。8章の「特別選考ルート」と「面談タブ」に今回の機能を追記。9章「運用で確認」に「日程を登録して LP で候補が出ること／確定メールが届くこと」、「未対応・検討」に「面談記録が数百件を超えたら画像を専用コレクション `meetingShots` に移す（ルール追加が必要）」を追記。3章の api 行に `specialSlots/specialConfirm` を追記。**
- [ ] **Step 2: `npm test` と `npm run build`** → Expected: 全 PASS／`✓ built`
- [ ] **Step 3: Commit** `git add CLAUDE.md && git commit -m "docs: 候補日程・スクリーンショット・流入経路表示を CLAUDE.md に反映"`
- [ ] **Step 4: 変更内容の要約をユーザーに提示し、承認後に `git push origin main`。反映後 `curl` で本番の `action=specialSlots` が `{"slots":[]}` 形式を返すことを確認。**
