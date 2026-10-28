# CLAUDE.md — モノ・ループ内定者マイページ 開発メモ

このファイルは、プロジェクトの現状・構成・運用手順・残タスクをまとめた作業引き継ぎ用ドキュメントです。

最終更新: 2026-10-23

---

## 1. 概要

内定者向けマイページ（学生ビュー）と採用管理コンソール（人事ビュー）を1つにまとめた本番運用中の Web アプリ。プロトタイプ `monoloop-mypage_1.jsx`（2310行）を本番化したもの。

- **本番URL**: https://monoloop-mypage.vercel.app
- **リポジトリ**: https://github.com/Monoloop9696/monoloop-mypage （**Public**）
- **ローカルパス**: `C:\Users\np021\Documents\monoloop-mypage`（Downloadsから移動済み）
- **管理者アカウント**: `imai.syuto@monoloop.jp`（admin カスタムクレーム付与済み）

## 2. 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロント | React 18 + Vite 5 + Tailwind 3（游ゴシック体・淡ピンク#F7CAD0＋マゼンタ#E4007F） |
| 認証/DB | Firebase Authentication（メール/PW）+ Cloud Firestore（Sparkプラン） |
| メール | Resend（送信元 `no-reply@monoloop.jp`／独自ドメイン認証済み） |
| サーバー処理 | Vercel Serverless Functions（`/api/*`） |
| LINE | Messaging API（公式アカウント「モノ・ループ 新卒採用公式アカウント」`@241mxauu`） |
| ホスティング/CI | Vercel（team `monoloop`）。GitHub `main` への push で自動デプロイ |
| 写真保存 | 画像を圧縮して **Firestore に base64 保存**（Firebase Storage は Blaze 必須のため未使用） |

Firebase プロジェクト: **`ml-my-page`**。ドメインは全て `monoloop.jp`（レジストラ/DNS: ムームードメイン=GMOペパボ、Web/メール: ロリポップ）。

## 3. 主要ディレクトリ

```
src/
  firebase.js            Firebase クライアント初期化
  theme.js               色・フォント定数（PINK #F7CAD0 / ROSE #E4007F 等）
  auth/AuthContext.jsx   ログイン状態・admin判定（/api/set-role でクレーム同期）＋**24時間無操作で自動ログアウト**（localStorage の ml_last_active を1分間隔で監視。期限切れ時は ml_idle_logout を立て、ログイン画面で案内表示）
  lib/
    firestore.js         Firestore CRUD/購読ヘルパー（全コレクション）
    api.js               /api/* 呼び出しラッパー
    area.js              住所→エリア(地方10区分)判定（AREAS / addressArea / matchesAreas）
    csv.js               CSV出力
    image.js             画像圧縮（fileToCompressedDataURL / dataUrlToThumb / downloadDataUrl）
    deadline.js          pastDeadline / deadlineText（日付＋任意の時刻で締切判定・表示を共通化）
    specialRoute.js      特別選考ルートの定義（SPECIAL_ROUTES / SPECIAL_STATUSES / コード正規化・状態判定 / specialUrl）
    scrollLock.js        useBodyScrollLock（モーダル/ドロワー表示中に背面を固定。iOS対策で position:fixed 方式・多重表示はカウントで管理）
    annualPlan.js        年間計画の純粋ロジック（PLAN_START_MONTH=8 / PLAN_MONTHS=20 / PLAN_KINDS / PLAN_STATUS / cycleMonths / posInCycle / inCycle / layoutRows / shiftYear / planYears / monthEnd / resolvePeriod / periodMode）。`tests/annualPlan.test.mjs` で検証
  components/SpecialAdmin.jsx  管理画面「特別選考」タブ（エントリー一覧・特別コード発行・スカウト文面）
  components/AnnualPlan.jsx    管理画面「年間計画」タブ（年表・月リスト・活動ドロワー・前年度コピー・システム記録の自動レーン。AdminApp からは props を渡すだけ）
  components/common.jsx  SectionTitle / EdHeader / FullLoader / **TimeSelect**（時・分の2プルダウン。5分刻み・min/max対応。時刻入力はすべてこれを使い、ブラウザ標準の type="time" は使わない）
  pages/
    Login / Signup（/signup/:year 動的・フリガナ/電話郵便ハイフン必須）/ ResetPassword / ResetConfirm（日本語再設定）
    Privacy / StudentApp（学生）/ AdminApp（管理）
    SpecialEntry（/special 特別選考LP・公開・ログイン不要）
api/                     ※Vercel Hobby は関数12個まで。現在11個（下記7参照）
  _lib/ firebaseAdmin.js（SA初期化・requireUser/requireAdmin）/ util.js / resend.js / line.js
  send-code / register / set-role / student-account(退会/復元＋action=lastLogin で最終ログイン取得) / public-cohorts(公開: 年度一覧＋**action=specialVerify/specialSlots/specialEntry**=特別選考LP、**action=specialConfirm**=管理者のみ・日程確定＋確定メール) / reset-password /
  line-webhook / line-broadcast / line-quota(送信枠) / broadcast-delete / questions(質問箱: action=ask/list/answer ＋ **action=bookInterview**=面談予約の確定とLINE送信。学生が呼べる認証済みAPIがここだけのため集約)
firestore.rules          セキュリティルール（firebaserules REST APIでデプロイ）
scripts/seed.mjs         cohorts/journeys 初期投入・admin クレーム付与
public/ logo.png loop.svg loopchan/loopchan-1〜8.png
```

## 4. データモデル（Firestore）

- `students/{uid}`: name, kana(フリガナ・あいうえお順の並び替えに使用), univ, birth, email, phone, zip, address, livesAtHome, homeZip, homeAddress, grad, joinDate, status(内定/承諾/辞退/承諾後辞退), **offerDate**(内定出し日), **acceptDate**(内定承諾日・ステータスを承諾にすると未入力なら自動で当日), **source**(流入経路＝媒体/紹介会社。選択肢は templates の _type:"source"), deleted, lineUserId, linkCode, createdAt
- `cohorts/{year}`: year, initialPassword, joinDate, active ※**管理者のみ読取可**（初期PWを含む）
- `events/{id}`: title, dateStr, time, date(Timestamp), place, deadlineDate(YYYY-MM-DD・出欠受付の締切／未設定は開催日基準), **deadlineTime**(HH:MM・任意。未設定はその日いっぱい), deadline(表示ラベル), **areas[]**(対象エリア地方区分キー・空=全員), **areaBasis**(current/home/either=現住所/実家/どちらか), targetUids[](個別指定の対象者uid・あればエリアより優先。公開後も管理画面の「対象者を調整」で変更可＝後から登録した学生の表示/非表示もここで), closed(管理者の最終受付終了。trueで到着も締切), **arrivalOn**(false=学生に会場到着ボタンを出さない。既定true), **arrivalLabel**(到着ボタンの文言。空なら「会場に到着したら押す」), copy, grad, published(false=下書き)。※回答期限超過で出欠回答は締切。到着は開催日当日以降いつでも押下可（管理者が closed にするまで）。エリア判定は住所文字列の先頭都道府県から（`src/lib/area.js`）
- `rsvps/{eventId}_{uid}`（管理画面は常時購読）: eventId, uid, answer(yes/no), arrived, arrivedAt(当日到着ボタン), changedAt/changeSeen(既回答からの変更を管理者に通知), cancelReason(管理者が欠席にした際のキャンセル理由)。※`setRsvp`はmerge。管理者用に `adminSetRsvp`(理由つき)/`deleteRsvp`(未回答に戻す)/`setRsvpArrived`/`markRsvpChangeSeen`
- `surveys/{id}`: title, **dueTime**(HH:MM・任意。回答期限の時刻), **desc**(説明文・任意。学生の回答画面でタイトル下に表示), dueDate(YYYY-MM-DD・自動終了), due(表示ラベル), time, **questions[]**（{id,type:single/multi/text,label,options[],required, **sectionId**, **branch**{選択肢:sectionId|"end"}}）, **sections[]**（{id,title,desc}・空=1ページ）, grad, published(false=下書き), **areas[]/areaBasis/targetUids[]**(イベントと同じ住所エリア絞り込み・個別指定。audienceの母集団に対してAND)。※旧形式 q1/opts[]/multi/q2 も後方互換で表示可（`surveyQuestions()` が吸収）
  - surveys には **audience**（{type:"all"} または {type:"event", eventId, group:"yes"|"arrived"}）で対象者を限定可。学生側は自分のrsvpで判定して表示、管理集計/CSVも対象者を分母に。LINE配信のイベント対象は group=yes/arrived/no/none（arrived=出席かつ当日到着ボタン押下）
- `responses/{surveyId}_{uid}`: surveyId, uid, **answers**（{[questionId]: 配列=選択 / 文字列=記述}）。旧形式 q1[]/q2 は `responseAnswers()` で吸収
- **面談の担当者**の選択肢も `templates` に `_type:"interviewer"`（{name, order}）で保存。面談タブの「管理する」から名称変更（既存の面談記録も自動更新）・削除・並び替え（手動▲▼／あいうえお順・面談数順）が可能
- **面談記録**は `templates` コレクションに `_type:"meeting"`（{uid, name, grad, date, time, interviewer, kind, next, **noteUniv/noteJob/noteWorry/noteParent/noteOther**, **shots[]**(スクリーンショットの圧縮済み dataURL・最大2枚・長辺480px/70KB以下。2026-10-27 追加。古い記録には無い)}）で保存。内容は5項目（大学の状況／就活の状況／不安な点／ご両親からの質問／その他）に分割。項目分け前の記録は `note` に入っており、編集時は「その他」へ読み込む（表示は meetingBody() が両形式を吸収）。**templates は管理者のみ read/write なので学生には見えない**（専用コレクションだとルール再デプロイが必要になるため）
- 流入経路（媒体・紹介会社）の選択肢は `templates` コレクションに `_type:"source"`（{name, order}）で保存＝ルール追加不要。内定者タブの「管理する」から**名称変更（該当学生の値も自動で書き換え）・削除・並び替え（手動▲▼／自動=あいうえお順・使用人数順）**が可能
- アンケートのテンプレは `templates` コレクションに `_type:"surveyTemplate"`（{name, data:{title,time,questions}}・回答期限は保存しない）で保存＝ルール追加不要
- `journeys/{grad}`: steps[]（id,label,desc,type, 任意で **date**(期日 YYYY-MM-DD。学生には表示しない。未対応でもこの日を過ぎたら Closed 扱いで強制的に通過し次が Now になる。固定ステップは対象外)/**linkType**(""/event/survey/line/profile/url)/link/**refId**(event/survey のときに対象を1件指定)/cta）※linkType が無い旧データは link の値から種別を推定。refId 指定のステップは**その対象者にだけ表示**され、回答すると完了扱い。**受付終了（イベント=closed/回答期限/開催日、アンケート=dueDate）を過ぎた未対応ステップは「Closed」として自動で通過**し Now が止まらない。汎用(event/survey・refIdなし)は1件でも回答済みなら完了＝イベント追加でNowが巻き戻らない
- `notices/{id}`: text, createdAt（全学年に表示）
- `articles/{id}`: title, body, grad(null=全学年), published, **publishAt**(予約公開日時・未来なら学生側で非表示。表示制御はクライアント側), thumb, createdAt
  - `articles/{id}/images/{imgId}`: data(圧縮base64 dataURL), order
- `templates/{id}`: LINE配信テンプレ。本体は {name, body, categoryId, order}、種別(カテゴリ)は同コレクション内の {_type:"category", name, order} ドキュメントとして保持（新コレクションを作らずルール追加デプロイを回避）
- `broadcasts/{id}`: LINE/メール配信ログ。{target(表示名), body, grad, count, lineCount, mailCount, lineNames[]/mailNames[](宛先氏名), sentBy, sentAt}。管理者はread可・write不可（Admin SDK）。管理画面の「配信履歴」で表示・個別削除(`/api/broadcast-delete`)。
- **特別選考ルート**（2026-10-23 追加・templates に保存＝ルール変更なし）:
  - 特別コード `templates/special_code_<CODE>`: {_type:"specialCode", code, label(媒体・送信回のメモ), expiresAt(YYYY-MM-DD|""), active, createdAt}。管理画面から setSpecialCode で作成（IDがコードなので重複不可）。
  - エントリー `templates/special_entry_<sha256(email)先頭24桁>`: {_type:"specialEntry", name, kana, univ, faculty, grad, email, phone, question, route(special1/special2/casual), code, codeLabel, status(SPECIAL_STATUSES), memo, resubmitCount, createdAt, updatedAt, agreedAt, **slotIds[]**(候補日程の id・①②のみ), **otherDate**(別日で調整を希望), **confirmedSlotId/confirmedAt/confirmMailAt**(人事が確定した日程・確定メール送信日時)}。**公開API（Admin SDK）だけが作成**。同じメールの再エントリーは同じドキュメントに上書き（status・memo・createdAt は保持、resubmitCount+1、slotIds/otherDate は最新で上書き、確定は日程の種別が変わったときだけ解除）。
  - 日程 `templates/{autoId}`（2026-10-27 追加）: {_type:"specialSlot", kind("seminar"=説明会→ルート①／"oc"=オープンカンパニー→ルート②), date(YYYY-MM-DD), start, end, note, **remaining**(残り人数・**人事が手入力**。null＝人数を出さない、0＝満員で学生は選べない。自動では減らない), active, createdAt}。LP には受付中・今日以降の枠だけ出す。判定ロジック（`slotKindForRoute / formatSlotLabel / selectableSlots / validateSlotSelection`）は `src/lib/specialRoute.js` にあり、**API も同じファイルを import** している（`tests/specialRoute.test.mjs`・`npm test`）。
  - ルートの id・名前・案内文は `src/lib/specialRoute.js` と `api/public-cohorts.js` の SPECIAL_ROUTES の**両方**にある（片方だけ直すとズレる）。
  - 年間計画の活動 `templates/{autoId}`（2026-10-28 追加）: {_type:"planItem", grad(卒年度), kind(seminar/oc/select/follow/media/campus/other), title, start/end(YYYY-MM-DD・end≧start), status(plan=予定/done=実施済み/cancel=中止), owner, memo, createdAt, updatedAt}。管理者のみ。追加は `addPlanItem`、更新は `touchPlanItem`（updatedAt を付ける）、削除は `deleteTemplate`、前年度からのコピーは `addPlanItems`（writeBatch で一括。全件成功か全件失敗なので、やり直しで一部が重複しない）。API は使わない。
  - templates を一覧で使う箇所（LINE配信テンプレの realTemplates）では specialCode / specialEntry / specialSlot / planItem を除外している。新しい _type を足すときも同様に除外が必要。
- `authCodes/{email}`(サーバー専用)
- `questions/{id}`: 質問箱。{uid, name, grad, text, answer, answeredAt, answeredBy, public, createdAt}。**クライアントは直接触らず、必ず serverless API `/api/questions`（body.action=ask/list/answer）経由**（関数上限対策で1関数に集約）。Admin SDK で読み書きするため Firestore ルール追加が不要。回答時は質問者の公式LINEへ通知（連携時）。

## 5. 環境変数 / 秘密情報

- `.env`（**gitignore済み・コミット禁止**）にローカル用。Vercel 側にも同内容を登録済み。
- 主要キー: `VITE_FIREBASE_*`, `RESEND_API_KEY`, `MAIL_FROM`, `LINE_CHANNEL_ACCESS_TOKEN/SECRET`, `VITE_LINE_ADD_FRIEND_URL`, `ADMIN_EMAILS`, `INITIAL_PASSWORD_*`(移行用/現在はcohortsが正), `FIREBASE_SERVICE_ACCOUNT`(1行JSON)。
- `.env` を書き換える時は **文字化け注意**（下記6参照）。

## 6. 開発・デプロイ手順（重要）

### Node の PATH
この環境は Node が PATH に無い。コマンド前に必ず:
```powershell
$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:PATH
Set-Location "C:\Users\np021\Documents\monoloop-mypage"
```

### ローカル開発
```powershell
npm run dev      # http://localhost:5173（vite.config.js の devApiPlugin で /api/* もローカル動作）
```
※ `vercel dev` は使えない（対話ログイン必要）。ローカルAPIは devApiPlugin 経由。

### 本番デプロイ = git push（自動）
`main` に push すると Vercel が自動ビルド&本番反映。

**push 運用ルール（2026-08-04 更新）:**
- GitHub 認証は **Windows 資格情報マネージャーに保存済み**のため、`git push origin main` は **Claude（アシスタント）が実行**してよい（PAT の埋め込みは不要）。
```powershell
git push origin main
```
- ただし **push は本番反映にあたる**ため、実行前に必ず **「今回の変更内容の要約」をユーザーに提示し、承認を得てから** push すること。無断 push は禁止。
- 承認は push ごと・その都度取得する（一度の承認を後続の push に流用しない）。

手動デプロイ（代替）: `vercel deploy --prod --yes --token <VERCELトークン>`（都度発行）。

### Firestore ルールのデプロイ
firebase CLI ではなく **firebaserules REST API** をサービスアカウントのアクセストークンで叩くスクリプトで実施（過去の一時スクリプト参照。ruleset作成→cloud.firestoreリリース更新）。

### seed（初期投入）
```powershell
npm run seed     # cohorts(2027/2028)・journeys・admin クレーム
```

### セッション運用ルール（2026-09-01 追加）
- **コンテキスト使用量が 80% を超えたら**、Claude（アシスタント）は言われる前に **この CLAUDE.md を最新化**（実施した変更・現状・残タスク）し、そのうえで **新しいセッションへの切り替えをユーザーに提案する**。
- **大きな作業が完了するたび**に、**「9. 残タスク」欄を都度更新**する（完了項目の移動・新たに判明した課題の追記）。
- CLAUDE.md の更新をコミット/push する場合も、上記の push 運用ルール（要約提示＋承認）に従う。

## 7. ハマりどころ（既知）

- **Vercel Hobby は Serverless 関数 12個まで**: `api/*.js` が13個以上になるとデプロイが失敗し、本番は最後に成功したビルドのまま止まる（エラーは画面に出ない）。現在**11個**。追加が必要なら既存APIに `action` 分岐で集約する（質問箱=`/api/questions` が実例）。
- **対象者の個別指定(targetUids)は「固定名簿」**: 一度 targetUids が入ると以後に登録した学生は対象外になる。以前は「対象者を確認・個別調整」を開いただけで固定されていたため、後から登録した学生にイベント/アンケートが表示されない事故が起きた（2026-10-06 修正：閉じるときに選択が条件どおりなら null に戻す）。既存の固定データは概況の「対象者を調整 → 個別指定を解除」で戻せる。
- **回答・出欠は常時購読**: 以前は管理画面を開いたときに一度だけ取得（getDocs）していたため、その後に届いた回答が「回答状況を更新」まで見えず未回答と誤認された。2026-10-06 に listenAllRsvps / listenAllResponses で常時購読に変更。学生側も送信中表示・失敗時のエラー・成功トーストを出す。
- **デプロイ遅延・キャンセル**: 連続pushすると Vercel は途中ビルドを取り消し最新だけをビルドするため、反映まで数十秒〜数分。push後は本番の `index-*.js` に目印文字列が入ったか `curl` で確認するのが確実。
- **一覧クエリはルールに合わせる**: `articles` のように per-doc条件(`published==true`)のあるコレクションは、クライアント側で `where("published","==",true)` を付けないと**学生ではクエリ全体が権限拒否**され0件になる（管理者はadminで読めるので気づきにくい）。events/surveys/articlesは published で絞る。
- **辞退・削除はソフト削除**: `deleted:true`＋Authの無効化のみで、rsvps/responses/面談記録は消えない。イベント・アンケートの集計とCSVは `eventRecordAudience` / `surveyRecordAudience`（在籍中の対象者＋その回に回答が残っている元・内定者。氏名に「（辞退）」等の印）を使う。LINE配信対象・タスク進捗・要フォロー判定は在籍中のみ（`eventAudience` / `surveyAudience`）。
- **リポジトリは Public 必須**: Vercel Hobby(無料) は private リポジトリの Git 自動デプロイをブロック（`Deployment Blocked`）。private に戻すなら Pro(有料) か手動デプロイ。
- **Firebase Storage 未使用**: 新規プロジェクトは Storage が Blaze 必須。写真は image.js で圧縮し Firestore に base64 保存（1枚<1MB, 無料枠1GBで数千枚）。大量運用時は Storage/Vercel Blob へ移行余地。
- **PowerShell**: `$pid` は予約変数（プロセスID）→ 別名を使う。`Get-Content` は既定ANSIで日本語が文字化け→ `.env` 等は `[System.IO.File]::ReadAllText/WriteAllText` の UTF-8(BOMなし) を使う。node終了時の `Assertion failed ... async.c` はWindowsの無害な警告。
- **セレクトの値を「保存値から推測」しない**: Journeyのリンク種別は `link` の文字列から種別を判定していたため、URL入力中に空/スキーム無しになった瞬間に種別が変わり入力欄が消えて保存できなかった（2026-09-01修正）。種別は `linkType` として明示保存する。
- **ブラウザ自動操作**: React の controlled input は mcp の form_input では onChange が発火しないことがある→ 実キー入力(type)で操作。
- **`<input type="date">` は grid の2列に入れない**: 日付入力は固有の最小幅があり、スマホ幅の `grid-cols-2` では縮まず隣の列（時刻セレクト）に重なる。スマホでは縦並び、PCでも親に `min-w-0`＋入力に `min-w-0 / maxWidth:100%` を付ける（2026-10-20 面談記録ドロワーで発生）。
- **メール配信**: Firebase 既定メール(firebaseapp.com)は迷惑メール判定されやすい→ 認証コード/パスワード再設定は Resend(no-reply@monoloop.jp) 経由に統一済み。列挙保護ONのため未登録アドレスは無送信で成功表示。

## 8. 完了済み機能

**学生（StudentApp）**:
- ヘッダー(正式ロゴ)＋上部アラート(未対応タスク)。右上メニュー(≡)に **質問箱／LINE連携／プロフィール／ログアウト** を集約（下部ナビは HOME/EVENTS/SURVEY/NEWS の4つ）。
- ホーム: ループちゃん(時間帯・誕生日・イベントで出し分け＋吹き出し)、**日付・時刻のライブ時計**、進捗バー、**Journey の固定ステップ**（先頭「内定/内定承諾」＝status で文言切替・管理画面の入力に関係なく常に表示し**入社日まで常に Now**、末尾「入社式」＝入社日(cohort の joinDate、無ければ卒業年4/1)まで Coming。入社日を過ぎると両方 Done。Now の計算からは除外するので他ステップの Now と同時に出る）、**内定承諾の演出**(status="承諾" になるとヘッダー下に「内定承諾済」バッジ、承諾後の初回ログインで全画面のお祝い＝紙吹雪＋ループちゃん。表示済みは localStorage `ml_accept_celebrated_<uid>` に記録し1回だけ。カウントダウンは出さない方針)、Journey(リンク可・**指定イベント/アンケートに紐づけると対象者にだけ表示＋タップでその1件を直接開く**)、直近イベント、お知らせ。
- イベント: 出欠(出席/欠席)。**未回答/回答済み/受付終了に枠分け**(回答期限=deadlineDate 超過 or 管理者の手動終了で受付終了)。**到着受付**(出席者は開催日当日以降いつでも押下可、回答締切とは独立、管理者が最終終了するまで)。回答変更時「担当者に共有」表示。**対象エリア/個別対象**に該当する学生にだけ表示。
- アンケート: **説明文(タイトル下)**・**動的設問(単一選択/複数選択/自由記述)**・**セクション分割＋回答による分岐**(1セクション1画面・次へ/戻る・通らなかったセクションの回答は保存しない)、未回答/回答済み/受付終了(dueDate)。**対象者限定**(全員 or 特定イベントの出席者/到着者)＋**対象エリア/個別対象**に該当する学生だけ表示。
- NEWS(記事＋写真, インスタ風=写真上/文章下, 写真保存ボタン)。**質問箱**(投稿・自分のQ&A履歴・公開FAQ)。LINE連携。
- ログイン／登録(`/signup/:year` 動的・卒年度停止対応・**フリガナ/電話郵便ハイフン必須**)／パスワード再設定(Resend＋日本語 `/reset-confirm`)。
- **LINE連携の導線強化（2026-10-20）**: ①登録完了直後は LINE連携タブを最初に開く（Signup が localStorage `ml_after_signup` を立て、StudentInner の初期タブで消費。タブ上部に「登録ありがとうございます／最後に連携を」の案内枠）。②未連携のあいだは上部アラートの先頭に「LINE連携をお願いします」をLINE緑で強調表示（`alerts` の `strong`）。③ループちゃんの吹き出しは未連携なら時間帯の挨拶より優先して連携をお願いする文言（`LOOPCHAN.line`・誕生日/イベント当日は従来どおり優先）。吹き出しタップでLINE連携タブへ。④`/api/register` が登録完了メール（Resend）を送信し、友だち追加URL（`VITE_LINE_ADD_FRIEND_URL`）と本人の連携コードを同封。メール失敗時も登録は成功扱い（レスポンスの `mailSent:false`）。マイページURLは `APP_URL`（未設定なら本番URL）。

**管理（AdminApp）**:
- **表示モード切替（PC表示 / スマホ表示）**: ヘッダーのボタンで切替、localStorage `ml_admin_pc` に保存（初回は画面幅1024px以上でPC）。PC表示＝最大1600px幅・左サイドバーナビ（下部タブは非表示）・概況/記事/LINE配信は2カラム。
- 年度スイッチャー(3件横並び＋pastプルダウン)。**イベント/アンケートの作成・編集画面は右からのドロワー**（ヘッダーと保存ボタンを固定、中身だけスクロール）。概況のイベント/アンケート一覧は**新しい3件まで表示＋残りは折りたたみ**。内定者タブの**アカウント配布情報は既定で折りたたみ**。
- 概況: 集計／**イベントCRUD**(下書き・回答期限(日付)・**対象エリア(現住所/実家/どちらも)＋個別対象者モーダル**・最終受付終了(手動)・**会場到着ボタンの有無/文言(作成フォーム＋公開後もカードから変更可)**・**出欠/到着の管理側編集＋キャンセル理由**・**公開済みイベントも「編集」で全項目を変更可（出欠/到着データは保持）**・**公開後も「対象者を調整」で個別に表示/非表示（後から登録した学生もこの一覧に出る）**・履歴から作成)／**アンケートCRUD**(動的設問・テンプレ/履歴から作成・下書き・対象者(イベント参加者)・**説明欄(desc)**・**セクション＋回答による分岐(単一選択の選択肢ごとに 次へ/指定セクション/終了)**・**対象エリア(現住所/実家/どちらも)＋対象者を確認・個別調整モーダル（公開後も「対象者を調整」で変更可）**・回答集計/CSV・**選択式は選択肢タップで回答者一覧モーダル**・**展開時は未回答を最上部に表示、設問はカード化してPCは2段組み、自由記述は3件表示＋全文モーダル**)／Journey(**ドラッグ並び替え**・リンク設定＝イベント/アンケートは**対象を1件指定可**)／お知らせ。
- 内定者: 配布カード・初期PW変更・卒年度追加/受付停止・**検索(名前/大学/住所/メール等)**・一覧/フィルタ（ステータス＋**現住所のエリア**（地方10区分・人数表示・「判定できない住所」も選べる。addressArea で判定）・**詳細(閲覧/「編集」で連絡先編集=現住所/実家分離・電話郵便ハイフン必須・氏名/生年月日/メールは編集不可・フリガナ)**・**24時間無操作で自動ログアウト**（最終ログイン日時を実態に合わせるため）・**内定出し日/内定承諾日/流入経路(プルダウン・選択肢は編集画面から追加可)**・**詳細に未対応タスクの内訳表示**・**まとめて編集(一覧の絞り込み結果を全画面で開き、学生ごとに個別入力して変更分だけ一括保存。編集範囲は個別編集と同じ。保存前に電話/郵便番号の形式を全件チェック)**・**一覧の並び替え(フリガナ/大学/内定出し日/内定承諾日/流入経路/ステータス/タスク進捗/最終ログイン＋昇順降順)**・**最終ログイン日時/アカウント作成日時**(Firebase Auth メタデータ。内定者タブで自動取得＋「ログイン状況を更新」ボタン、一覧・詳細・CSVに表示)・ステータス変更(内定/承諾/辞退/承諾後辞退/**テスト**)・辞退→無効化/復元・CSV。名前は**フリガナであいうえお順**。テストアカウントは集計/配信対象外。
- **面談の日程調整**: ①管理者が依頼を送る（固定ひな形 INTERVIEW_REQUEST_TEMPLATE。`{name}`=送信時に各自の名前へ置換＝サーバー側、`{due}`=提出期限に置換＝クライアント側。対象者へLINE一斉送信）→ ②学生がマイページで候補日時を複数提出（`/api/questions` action=proposeSlots が `proposals.<uid>` に書き込む）→ ③管理者が候補と**担当者**を選んで確定（学生の希望は「**開始できる時刻の範囲**」として扱い、その範囲内で**開始時刻を5分刻みで指定**（TimeSelect の min/max）・所要時間15/30/45/60分（既定30分）。希望の時間帯には合計時間を表示せず、確定した面談にだけ所要時間を出す＝slotText(slot, true)。担当者ごとのZOOM情報が自動で入る。`bookings.<uid>` に保存し確定文面をLINE送信）→ ④学生のマイページに確定内容が残る。一覧では面談者ごとに「×」で依頼から外せる（removeInterviewTarget＝targetUids から除外＋proposals/bookings の該当分を deleteField）。候補が未提出の学生は「日時を指定して確定」で管理側が日付・開始時刻・所要時間を直接指定できる（モーダルの「こちらで日時を指定」）。「一覧／カレンダー」切替があり、カレンダーは**確定した面談(緑・予定)と実施後の面談記録(灰・記録)**を月表示（学生の未確定の希望は出さない）。**日付セルを押すとその日の予定・記録をカレンダー下に一覧表示**（`ivCalDay`＝選択日。PC・スマホ共通。PCはセル内にも3件まで文字表示、スマホはセルが狭いので点だけ＝2026-10-20）。予定の詳細モーダルの ZOOM URL は「ZOOMを開く」ボタン＋リンクで新しいタブに開く。**同じ学生・同じ日の面談記録が付くと予定は消えて記録だけになる**（bookingRecorded）。セル内の項目を直接クリック：記録→記録ドロワーを開く、予定→詳細モーダル（ZOOM情報／「面談を記録する」＝日時・担当者を自動入力して開く／「リスケ」）。**リスケ**は確定モーダルを現在の予定を初期値にして開き、上書き保存して変更案内をLINE送信（ivResched で文面切替）。リスケ時は学生の希望候補 proposals も同時に削除（setInterviewBooking の clearProposal）。一覧の確定済み行にも「記録」「リスケ」（実施済み＝記録ありの人には出さない）。確定モーダルには「確定後に公式LINEで案内を送る」チェック（既定オン、ivSendLine）があり、オフなら保存のみでLINEは送らない。依頼カードは既定で折りたたみ（タイトルで開閉）。保存は `surveys` に **interview:true**（学生が読めるのが surveys のため／ルール変更不要）。アンケート一覧・集計・タスク進捗・LINE配信対象からは `interview !== true` で除外。担当者のZOOM情報は `templates` の `_type:"interviewer"` に zoomUrl/zoomId/zoomPass として持つ。特定の学生だけへのLINE送信は `/api/line-broadcast` の `uids` で行う。
- **面談タブ**: 面談の記録（日付/時刻/種別/担当者=プルダウン・その場で追加可/5項目の内容/次回予定）をドロワーで追加・編集・削除。PCではドロワーを左右2カラムにし、右側にその内定者の**パルス調査の推移（全体平均つき）・直近の自由記述・過去の面談記録**を表示して書きながら参照できる（スマホは開閉ボタン）。表示は「内定者別（既定・左）」と「日付順（右）」の2モード＋横断検索（2026-10-20 に既定を内定者別に変更）。**内定者別はコンパクトなカード**（氏名・大学・「面談N回／未実施」バッジ・最終面談・次回予定・＋記録。PCは3列グリッド、スマホは1列）で、**カードをタップすると面談履歴モーダル**（`meetHist`・z-60）に全件を表示し、編集・削除・「＋記録を追加」ができる（記録ドロワーは z-65 なのでモーダルの上に開き、閉じると履歴に戻る）。日付順はPCで2列グリッド。内定者の詳細にも直近3件を表示。**記録ドロワーの「内定者」は「氏名（大学名 学部）・流入経路」で表示**（未登録は「流入経路 未登録」。履歴モーダルの見出しも同じ。2026-10-27）。**スクリーンショット**（2026-10-27）: ドロワーの「学生の様子」枠をクリックして Ctrl+V（Win+Shift+S で撮った画像をそのまま貼れる）／ドラッグ＆ドロップ／ファイル選択。最大2枚、`image.js` で長辺480px・70KB以下に圧縮し記録と同じドキュメントの `shots` に保存。サムネイルは日付順・履歴モーダル・内定者詳細・PCドロワー右側の過去記録に出し、タップで拡大（`shotView`・z-90）。画像以外の貼り付けは無視する。
- **パルス調査**: 分析タブの「今回の調査をつくる」で、毎回同じ設問(PULSE_QUESTIONS・5段階評価4問＋自由記述)を入れた状態で**通常のアンケート作成ドロワー**が開く（対象者・エリア・個別調整・期限を通常どおり指定できる）。保存は surveys に `pulse:true`（学生が読めるのは surveys のため）、回答は通常どおり responses。分析タブの一覧から編集・削除（回答も消去）が可能。設問タイプ **scale**（5段階評価・minLabel/maxLabel）は設問ビルダーの正式な種別で、通常のアンケートにも追加できる。
- **要フォロー自動判定**（AI不使用のルールベース／分析タブはサマリー表示＋「すべて見る」でドロワー）: スコアの低さ/前回比の低下/調査未回答/ログイン間隔/イベント欠席・未回答/アンケート未回答/面談間隔/LINE未連携を点数化し「高/中/低」と理由＋フォロー案を提示。重み付けは followUpOf() にまとまっている。
- ※イベント／アンケートの編集ドロワーは**概況タブの中**に描画している。他タブから開くと表示されないまま背面固定だけかかって操作不能になるため、分析タブからの編集・作成は `setTab("dash")` してから開くこと。
- **分析タブ**: 採用ファネル(承諾率/辞退率)・内定→承諾日数(平均/中央値)・エリア別・流入経路別(承諾率)・内定出し月別・承諾月別・大学別・エンゲージメント(LINE連携率/イベント出席率/アンケート回答率)・面談実施率。全年度/卒年度で切替。グラフはCSSバーで描画（ライブラリ追加なし）。
- 記事: **予約投稿(publishAt。予約時はLINE通知なし＝公開時刻に動くサーバー処理が無いため)**・写真アップロード(自動圧縮・**画質重視 最大1600px/品質0.85/1MB枠**)・公開対象・公開/非公開・**編集**・削除・**投稿時に対象者の公式LINEへ自動通知**(任意ON)。
- 質問箱: 一覧・回答(質問者へLINE通知)・公開切替・削除・未回答バッジ。
- LINE一括配信: 対象は**モーダルで選択**（各選択肢に人数表示）。ステータス別／**イベント参加状況(出席者/到着者/欠席者/未回答者)**／**アンケート回答状況(未回答/回答済み)**／**個別選択（2026-10-20）**＝「登録済みの学生から選ぶ」と各アンケートの「回答済みから選ぶ」で、検索つきチェックリストから1人ずつ送信先を選べる（`target="pick"`・`pickUids/pickLabel`。送信時は既存の `uids` 指定で `/api/line-broadcast` に渡す＝API変更なし。配信対象カードに送信先の氏名を表示。年度切替で解除）。対象の判定は `/api/line-broadcast` 側にも同じロジックがある（片方だけ直すとズレる）。**{name}差し込み**(個別push)。**今月の送信数(無料枠200/月・毎月リセット)表示＋超過ガード**。**配信履歴**(本文・宛先氏名・日時・件数、折りたたみ＋ページング、**個別削除**)。テンプレ管理(種別カテゴリ・並び替え・削除)。※Managerの「メッセージ配信」履歴には出ない旨の注記あり。
- 学生画面プレビュー(操作可・DB非保存)。

**特別選考ルート（2026-10-23）**:
- 公開LP `/special?code=XXXX`（SpecialEntry.jsx）: **最初の画面でお名前＋特別コードを確認**（招待状を開く）→ LP本文は「あなた」の部分を**入力した名前（〇〇さん）に差し替えて表示**（招待メッセージ → 特典 → **ルート選択（特別選考ルート①＝説明会→書類免除→一次→二次→最終→内定／特別選考ルート②＝オープンカンパニー→書類免除→一次→最終→内定／カジュアル面談）**。id は special1 / special2 / casual。2026-10-26 に旧「特別選考(special)／社員座談会(talk)」から変更。ヘッダーの表記は「モノ・ループ株式会社」）→ フリガナ・大学・卒業年度・メール等 → 完了。`?code=` でコード欄が埋まる。確認済みの名前・コードは sessionStorage `ml_special_gate` に残し、同じタブの再読み込みでは入口を飛ばす（コードは毎回再確認）。卒業年度の選択肢は受付中の cohorts から作る。ボット対策の隠し入力欄（website）あり。
- `/api/public-cohorts` action=specialVerify（コードの有無・期限・停止を判定。媒体メモは返さない）/ specialEntry（再検証→保存→本人へ受付メール・ADMIN_EMAILS へ通知メール。メール失敗でも保存は成功扱い）。**関数数は11のまま**。
- 管理「特別選考」タブ（SpecialAdmin.jsx・未対応件数をタブにバッジ表示）: 集計（総数・未対応・ルート別）の下に**表示切替（エントリー／説明会・OCの日程／特別コード／スカウト文面。年度スイッチャーと同じ形・各1つずつ全幅表示。2026-10-28 に右カラム3区画の配置から変更）**。エントリー一覧（検索・ルート/状況/コード/日程で絞り込み・対応状況の変更・対応メモ・削除・CSV）／特別コードの発行（コード・経路メモ・有効期限。PCは2列カード）・停止/再開・削除・URLコピー・LPを開く・コード別件数／選んだコードを入れたスカウト文面のコピー。
- **候補日程（2026-10-27）**: 管理タブの「説明会・オープンカンパニーの日程」で種別・日付・開始/終了・残り人数（手入力）・補足を登録（PCは1行フォーム）、停止/再開・削除、日程ごとに「希望N名・確定N名」。**種別で色分け**（説明会＝青系 `KIND_STYLE.seminar`、OC＝橙系 `KIND_STYLE.oc`。フォーム・一覧カード・エントリーの候補チップに適用）。一覧は**説明会／OC の2列**（PC）にカードで並び、**終了した日程（今日より前）は自動で隠れる**（「終了した日程を表示（N件）」で表示。削除は不要。LP・日程フィルターにも出ない）。LP ではルート①②を選ぶとフォーム先頭に候補がチェックボックスで並び（複数可。「残りN名」「満員」表示、満員は選べない）、一番下に「候補の中に参加できる日がない（別日で調整を希望）」。候補も別日希望も無ければ送信不可。公開中の枠が無いときは設問を出さず「日程は人事からご連絡します」。受付メール（本人・管理者）に候補を列挙。エントリーカードに候補チップ・別日希望・確定バッジ、「確定する日程」プルダウン（そのルートの種別の受付中の枠＋候補＋確定済み。候補は「（希望）」付きで先頭）→ 確認ダイアログ（「確定後に学生へメールで案内を送る」既定オン）→ `/api/public-cohorts action=specialConfirm`（管理者認証）で確定・対応状況を「日程調整済」に・確定メール送信（件名「【モノ・ループ】{説明会|オープンカンパニー}の日程が確定しました」）。**残り人数は自動で減らない**ので確定後に人事が減らす。
- プライバシーポリシーに「特別選考エントリーページ」と「採用選考とそれに関するご連絡」の利用目的を追記。
- **年間計画タブ**（2026-10-28。AnnualPlan.jsx。設計: `docs/superpowers/specs/2026-10-28-annual-plan-design.md`）: 卒年度ごとの年表。**期間は卒業年の2年前の8月1日〜卒業年の3月31日の20か月**（2028卒＝2026-08〜2028-03。`src/lib/annualPlan.js` の定数）。PCは横スクロールの年表（列＝暦月・88px、左にレーン名、今月の列は琥珀色、初期表示で今月が見える位置へスクロール）、スマホは月ごとの縦リスト（今月に枠と「今月」ラベル。切替は `pc` prop）。**活動カード**は人事が置く（種類7つ＝説明会/OC/選考/内定者フォロー/媒体・スカウト/学内・大学/その他で色分け。予定＝破線・白地、実施済み＝✓＋塗り、中止＝取り消し線）。「＋ 活動を追加」／カードを押すとドロワー（z-65。活動名・卒年度・種類・期間・担当者・状態3ボタン・メモ・削除は2段階確認）。**期間の入力**（10/28 修正）: 「開始日と同じ（終了日を入れない）」チェック（既定オン）で終了日欄を出さず end=start、「月で入力」チェックで日付入力の代わりに月のセレクト（その年度の20か月。1か月だけ／開始月〜終了月）になり、保存時に1日〜末日へ落とす（`resolvePeriod`）。既存カードを開いたときは日付からチェック状態を復元（`periodMode`。1日〜末日なら「月で入力」）。保存する形は従来どおり start/end の YYYY-MM-DD なのでデータは変わらない。**年表の置き方**（`layoutRows`）: 単日の項目（start=end。システムの記録も全部これ）は日付の位置ではなく**月の枠に収める**（列の整数位置・幅1列）。同じ月に4件以上あると先頭3件＋「他N件」ボタンになり、押すとその月の全件を一覧するドロワー（活動なら開いて編集、記録なら元のタブへ）。○〜○の期間がある項目だけ日付の位置に幅をとって置く（期間末の列を越えない）。同じレーンで重なるものは行を分ける。**年表の期間外の日付のカードは出さず、見出しの「期間外 N件」ボタンを押すと一覧が開き、そこから開いて日付や卒年度を直せる**（ドロワーにも注意書き。新規カードの既定日は今日、ただし今日がその年度の期間外なら期間の初日＝`defaultPlanDate`）。入力エラー・保存失敗は**ドロワー／ダイアログの中に表示**し、AdminApp の共通バナー（赤・消えない）は使わない。凡例の種類を押すとそのレーンを隠す。**システムの記録**（既存データ・読み取りのみ）を灰色のレーンで下に出す: イベント(dateStr)・アンケート(dueDate か createdAt・パルスは「パルス調査：」付き)・記事(publishAt か createdAt・grad なしは全年度)・LINE配信(sentAt・配信対象名)・面談(月ごとの件数)・説明会/OC日程(全年度)。押すと共通の年度を揃えてそのタブへ移動。「システムの記録も表示」で一括非表示。**前年度を重ねて表示**（既定オン）で前年度の年表を下に描画（同じ月の列に揃う。2枚のボードの横スクロールは `syncScroll` で連動させる）。**前年度からコピー**: 前年度の中止以外の活動を、日付＋1年（2/29→2/28）・状態「予定」・メモ無しで一括追加（確認モーダル。重複判定はしない。前年度が候補にない／コピーできる活動が0件のときも同じダイアログで案内）。**年度の候補は「cohorts の年度 ∪ 活動がある年度 ∪ その最大＋1」**（内定者がまだいない次の年度の計画を先に立てられる）。このタブは独自の年度切替を持つので、AdminApp 共通の年度スイッチャー＋「学生画面」ボタンは `tab !== "plan"` で隠す。broadcasts は LINE タブと年間計画タブを開いたときに読み込む。

**LINE Webhook**: 友だち追加(follow)時・その他メッセージへの自動返信は廃止し、**連携完了時のみ**「連携が完了しました」を送信。

**基盤**: cohorts(卒年度動的化)・Security Rules全面・Resendドメイン認証・LINE(Webhook active)・Vercel本番+GitHub自動デプロイ・游ゴシック統一・配色リブランド・color-scheme:light。**新規コレクション追加を避けてルール再デプロイを回避**(questions=API経由/アンケートテンプレ・種別=templates内 _type)。

## 9. 残タスク・直近の作業

### 直近の主な追加（2026-09-01〜10-20、すべて本番反映済み）
- アンケート: 選択肢タップで回答者一覧／説明欄／エリア・個別の対象指定／セクション＋回答分岐／5段階評価／集計の見やすさ改善（未回答を上部・2段組み・自由記述モーダル）
- イベント: 期限に時刻／会場到着ボタンの有無と文言／公開後の編集／対象者の後から調整
- Journey: 外部URL保存バグ修正／イベント・アンケートの個別指定と対象者限定表示／期日で強制通過／固定ステップ（内定・内定承諾＝常にNow、入社式＝末尾）
- 内定者: 内定出し日・内定承諾日・流入経路（マスタ管理）／未対応タスク表示／並び替え／まとめて編集／最終ログイン／**現住所のエリア別フィルター**／辞退・削除済みの過去回答を集計に残す
- 管理画面: PC表示モード（サイドバー・2カラム）／ドロワー化／折りたたみ／背面スクロール固定／記事の予約投稿／LINE配信対象のモーダル化＋アンケート対象
- 新タブ: **分析**（ファネル・エリア・流入経路・月別・エンゲージメント・面談実施率・パルス調査・要フォロー判定）／**面談**（記録5項目・担当者マスタ＋ZOOM情報・**日程調整**＝依頼→学生が候補提出→確定/リスケ（LINE送信の有無を選択可）・カレンダー）
- 基盤: 24時間無操作で自動ログアウト／時刻入力を時・分の2プルダウンに統一／回答・出欠の常時購読／対象者モーダルを開いただけで個別指定に固定されるバグ修正
- LINE連携の導線強化（10/20）: 登録直後にLINE連携タブを表示／未連携アラートの強調／ループちゃんの吹き出しで連携をお願い／登録完了メールに連携手順を同封（8章「学生」参照）
- LINE一括配信の個別選択（10/20）: 登録済みの学生から1人ずつ選んで送信／アンケートの回答済みの中から個別に選んで送信（8章「管理」のLINE一括配信参照）
- 面談の記録の見直し（10/20）: 内定者別を既定に（日付順は右）／内定者別はPC3列のカード表示／カードタップで面談履歴モーダル／日付順はPC2列（8章「面談タブ」参照）
- 面談のスマホ対応（10/20）: 記録ドロワーの面談日・開始時刻をスマホでは縦並びに（date入力が縮まず重なっていた）／カレンダーは日付を押すと下に一覧（PC・スマホ共通）／ZOOM URL をリンク化
- 特別選考タブのレイアウト見直し（10/28）: 表示切替（エントリー／日程／コード／文面）・日程の種別色分け・説明会/OC 2列カード・終了した日程の自動非表示
- **年間計画タブ（10/28）**: 卒年度ごとの20か月の年表に活動カード（予定/実施済み/中止）とシステムの記録を並べる。前年度の重ね表示・前年度からコピー。同日 修正: 期間入力に「開始日と同じ」「月で入力」チェック、単日の項目は月の枠に収め4件以上は「他N件」ドロワー（8章「年間計画タブ」参照。設計 `docs/superpowers/specs/2026-10-28-annual-plan-design.md`、計画 `docs/superpowers/plans/2026-10-28-annual-plan.md`）
- 特別選考LPの候補日程・面談記録のスクリーンショット・面談記録の流入経路表示（10/27。設計: `docs/superpowers/specs/2026-10-27-special-slots-screenshot-source-design.md`、計画: `docs/superpowers/plans/2026-10-27-special-slots-screenshot-source.md`）。`npm test`（Node 標準の node --test・追加パッケージなし）で日程ロジックを検証。

### 運用で確認・実施してほしいこと（ユーザー側）
- [ ] **特別選考ルートの確認（2026-10-23 追加分）**: ①管理「特別選考」でテスト用コードを発行 ②「LPを開く」から自分のメールでエントリー ③受付メール・管理者通知メールが届く ④一覧に出て状況・メモが変えられる、を確認。確認後テストのエントリー・コードは削除。
- [ ] **特別選考LPの文言の確定**: ルートの中身（所要時間・ステップ・案内文）、「なぜあなたに届いたのか」、FAQ は仮の文面。実際の選考フローに合わせて `src/lib/specialRoute.js`（＋ api/public-cohorts.js の案内文）と SpecialEntry.jsx を直す。
- [ ] **媒体の規約確認**: スカウト本文に外部URLを載せてよいか、媒体ごとに確認する。
- [ ] 特別選考ルートの id を 10/26 に変更したため、それ以前のテストエントリー（route が special / talk）は管理画面で id のまま表示される。残っていれば削除する。
- [ ] **候補日程の実機確認（2026-10-27 追加分）**: ①管理「特別選考」で説明会の日程を2件登録（1件は残り0）②LP でルート①を選び、候補が出て満員が選べないこと・候補も別日希望も無しで送信できないこと ③自分のメールでエントリー→受付メールに候補が載る ④管理画面で確定→確定メールが届き対応状況が「日程調整済」になる ⑤同じメールでルート②に再エントリー→確定が解除される（Claude 側はローカルで②まで確認済み。③〜⑤はメール送信を伴うため未確認）。
- [ ] **年間計画タブの実機確認（2026-10-28 追加分）**: ①タブが出る（PC左メニュー・スマホ下部）②年度切替に「最大＋1」の年度が出る ③「＋ 活動を追加」→保存→年表にカードが出る→カードを押して「実施済み」に切替 ④「前年度からコピー」で件数どおり追加される ⑤スマホ表示で月リストになり「今月」に枠が付く ⑥灰色の記録（イベント・LINE配信など）を押すとそのタブに移る ⑦ドロワーで「月で入力」にして保存→年表で月の枠いっぱいのカードになる ⑧同じ月にLINE配信などが4件以上あると「他N件」→押すと一覧ドロワーが開く。（Claude 側はサンプルデータで画面単体の描画・ドロワー・スマホ表示を確認済み。Firestore 保存とタブ遷移は管理者ログインが要るため未確認）
- [ ] **面談記録のスクリーンショットの実機確認**: Win+Shift+S で撮って貼る／テキストを貼っても何も起きない／3枚目でエラー／保存後に履歴モーダル・内定者詳細に出る（管理者ログインが必要なため Claude 側で未確認）。
- **特別選考ルートを廃止するときの手順**（コードは1コミット e2f60c7 にまとまっているので戻しやすい）: ①管理「特別選考」で全コードを「停止」にし、配布済みコードの有効期限が切れるのを待つ（消すと `/special` はログイン画面へリダイレクト） ②同タブでエントリーとコードを削除（templates の `_type:"specialCode" / "specialEntry"`。残しても他機能に影響はない） ③`git revert e2f60c7` でコードを戻す（SpecialEntry.jsx / SpecialAdmin.jsx / specialRoute.js の削除と、App.jsx・AdminApp.jsx・api.js・firestore.js・public-cohorts.js・Privacy.jsx の小変更の取り消しが一括で行われる） ④ビルド確認 → 要約提示 → 承認後 push。ルール・環境変数・Vercel関数数は変えていないので、それらの作業は不要。
- [ ] **固定されたままの対象者を解除**: 「10/1 内定式」「【27卒】店舗インターンについて」「内定者小規模懇親会―東海―」は作成時点の名簿で targetUids が固定されている。概況のカード→「対象者を調整」→「個別指定を解除（条件どおりに戻す）」で後から登録した学生にも表示される（2026-10-06 時点で未実施なら要対応）。
- [ ] **面談カレンダー・確定モーダルの目視確認**（管理者ログインが必要なため Claude 側で未確認）。
- [ ] 質問箱・面談日程調整（依頼→候補提出→確定→LINE）の実学生での通しテスト。
- [ ] LINE公式アカウントの自動応答をOFF（OA Manager）にして Webhook を確実に優先。
- [ ] **登録→LINE連携の新導線の実機確認**: テスト用メールで `/signup/<年度>` から登録し、①LINE連携タブが最初に開く ②登録完了メール（連携コード入り）が届く ③連携コード送信で「連携が完了しました」が返る、を確認。
- [ ] 未連携者への定期リマインド運用: LINE一括配信で対象「未連携」を選ぶとメールで届く（既存機能）。登録から3日・1週間などのタイミングで人事が送る運用を決める。自動化するなら Vercel Cron（Hobbyは1日1回）＋既存APIに action 追加。

### 未対応・検討（任意）
- [ ] **パルス調査のAI分析**: 現在はルールベースのみ。入れる場合は ANTHROPIC_API_KEY の登録・従量課金・学生回答の外部送信の判断が必要（既存APIに action 追加で関数数は維持可）。
- [ ] パルス調査の全体平均は在籍中の学生のみで計算（辞退者を含めた過去値にしたい場合は要対応）。
- [ ] 記事の予約投稿は公開時刻の LINE 通知ができない（公開時刻に動くサーバー処理が無い）。必要なら Vercel Cron（Hobby は1日1回）か外部スケジューラ。
- [ ] 予約記事は published:true で保存され表示制御はクライアント側（Firestore を直接読めば公開前でも内容は見える）。厳密にするならルール側で publishAt を見る。
- [ ] 特別選考エントリー → 内定後に**マイページのアカウントへつなぐ導線**（例：エントリー一覧から /signup/<年度> の案内を送る）。現状は別管理。
- [ ] **面談記録の画像は記録と同じドキュメントに同居**（管理画面は templates 全件を常時購読するため、画像が増えるほど管理画面を開くたびの通信量が増える。最大140KB/記録）。面談記録が数百件を超えて表示が重くなったら、専用コレクション `meetingShots` に移す（ルール追加＝REST API での再デプロイが必要）。
- [ ] 特別選考LPの**連投対策**は隠し入力欄＋コード必須のみ。悪用が見えたらコード単位・IP単位の回数制限を検討。
- [ ] 独自ドメイン `mypage.monoloop.jp`（Vercel でドメイン追加＋ムームーDNSにCNAME）。
- [ ] 写真の原本画質が必要なら Firebase Storage(Blaze) か Vercel Blob へ移行（現状は1MB/枚の圧縮）。
- [ ] Vercel 関数は **11/12**。新API追加は既存に action で集約する。
- [ ] エリア判定は住所先頭の都道府県名。判定不可の学生は内定者タブの「判定できない住所」で抽出し「まとめて編集」で整える。
- [ ] Signup画面の問い合わせ先文言の統一。
- [ ] トークン管理: GitHub PAT / Vercel トークンの削除・再発行方針。
- [ ] favicon は `loop.svg` のまま（正方形ロゴがあれば差し替え）。

### 別PCで作業する場合
Claude Code・Git・Node.js(v18+) を入れ、`git clone https://github.com/Monoloop9696/monoloop-mypage.git` → **`.env` をこのPCから安全にコピー**（Git には入っていない。UTF-8 BOMなしのまま）→ `npm install` → `npm run build`。Claude Code では **プロジェクトフォルダを直接開く**（CLAUDE.md が自動で読まれる）。`.env.local` と `.vercel` は不要。2台で使うときは作業前に `git pull origin main`。メモリ（~/.claude/projects/…/memory）はPCごとに別だが、運用ルールは本ファイル6章にある。

**過去に単発対応**: 2027卒のテスト学生の完全削除スクリプト運用、記事表示の権限バグ修正(articles クエリに published 条件)、Vercel 12関数超過の解消(質問箱API統合)、questions.js の serialize 誤削除で質問箱が500になった件の復旧(2026-09-29)。

## 10. 外部アカウント/連携メモ

- Firebase: プロジェクト `ml-my-page`（承認済みドメインに `monoloop-mypage.vercel.app` 追加済み）
- Resend: 送信専用APIキー。ドメイン `monoloop.jp` 認証済み（send サブドメインにSPF/DKIM/MX、DNSはムームー）
- LINE: 新チャネル（`@241mxauu`）。Webhook `https://monoloop-mypage.vercel.app/api/line-webhook`（active:true）
- Vercel: team `monoloop` / project `monoloop-mypage`（projectId prj_yvMhIHmBibStBXuc2hoYm0N6w6CN）
- GitHub: `Monoloop9696/monoloop-mypage`（Public, default branch main）
