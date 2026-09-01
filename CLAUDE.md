# CLAUDE.md — モノ・ループ内定者マイページ 開発メモ

このファイルは、プロジェクトの現状・構成・運用手順・残タスクをまとめた作業引き継ぎ用ドキュメントです。

最終更新: 2026-09-01

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
  auth/AuthContext.jsx   ログイン状態・admin判定（/api/set-role でクレーム同期）
  lib/
    firestore.js         Firestore CRUD/購読ヘルパー（全コレクション）
    api.js               /api/* 呼び出しラッパー
    area.js              住所→エリア(地方10区分)判定（AREAS / addressArea / matchesAreas）
    csv.js               CSV出力
    image.js             画像圧縮（fileToCompressedDataURL / dataUrlToThumb / downloadDataUrl）
  components/common.jsx  SectionTitle / EdHeader / FullLoader
  pages/
    Login / Signup（/signup/:year 動的・フリガナ/電話郵便ハイフン必須）/ ResetPassword / ResetConfirm（日本語再設定）
    Privacy / StudentApp（学生）/ AdminApp（管理）
api/                     ※Vercel Hobby は関数12個まで。現在11個（下記7参照）
  _lib/ firebaseAdmin.js（SA初期化・requireUser/requireAdmin）/ util.js / resend.js / line.js
  send-code / register / set-role / student-account / public-cohorts / reset-password /
  line-webhook / line-broadcast / line-quota(送信枠) / broadcast-delete / questions(質問箱: action=ask/list/answer)
firestore.rules          セキュリティルール（firebaserules REST APIでデプロイ）
scripts/seed.mjs         cohorts/journeys 初期投入・admin クレーム付与
public/ logo.png loop.svg loopchan/loopchan-1〜8.png
```

## 4. データモデル（Firestore）

- `students/{uid}`: name, kana(フリガナ・あいうえお順の並び替えに使用), univ, birth, email, phone, zip, address, livesAtHome, homeZip, homeAddress, grad, joinDate, status(内定/承諾/辞退/承諾後辞退), deleted, lineUserId, linkCode, createdAt
- `cohorts/{year}`: year, initialPassword, joinDate, active ※**管理者のみ読取可**（初期PWを含む）
- `events/{id}`: title, dateStr, time, date(Timestamp), place, deadlineDate(YYYY-MM-DD・出欠受付の締切／未設定は開催日基準), deadline(表示ラベル), **areas[]**(対象エリア地方区分キー・空=全員), **areaBasis**(current/home/either=現住所/実家/どちらか), targetUids[](個別指定の対象者uid・あればエリアより優先), closed(管理者の最終受付終了。trueで到着も締切), copy, grad, published(false=下書き)。※回答期限超過で出欠回答は締切。到着は開催日当日以降いつでも押下可（管理者が closed にするまで）。エリア判定は住所文字列の先頭都道府県から（`src/lib/area.js`）
- `rsvps/{eventId}_{uid}`: eventId, uid, answer(yes/no), arrived, arrivedAt(当日到着ボタン), changedAt/changeSeen(既回答からの変更を管理者に通知), cancelReason(管理者が欠席にした際のキャンセル理由)。※`setRsvp`はmerge。管理者用に `adminSetRsvp`(理由つき)/`deleteRsvp`(未回答に戻す)/`setRsvpArrived`/`markRsvpChangeSeen`
- `surveys/{id}`: title, **desc**(説明文・任意。学生の回答画面でタイトル下に表示), dueDate(YYYY-MM-DD・自動終了), due(表示ラベル), time, **questions[]**（{id,type:single/multi/text,label,options[],required}）, grad, published(false=下書き), **areas[]/areaBasis/targetUids[]**(イベントと同じ住所エリア絞り込み・個別指定。audienceの母集団に対してAND)。※旧形式 q1/opts[]/multi/q2 も後方互換で表示可（`surveyQuestions()` が吸収）
  - surveys には **audience**（{type:"all"} または {type:"event", eventId, group:"yes"|"arrived"}）で対象者を限定可。学生側は自分のrsvpで判定して表示、管理集計/CSVも対象者を分母に。LINE配信のイベント対象は group=yes/arrived/no/none（arrived=出席かつ当日到着ボタン押下）
- `responses/{surveyId}_{uid}`: surveyId, uid, **answers**（{[questionId]: 配列=選択 / 文字列=記述}）。旧形式 q1[]/q2 は `responseAnswers()` で吸収
- アンケートのテンプレは `templates` コレクションに `_type:"surveyTemplate"`（{name, data:{title,time,questions}}・回答期限は保存しない）で保存＝ルール追加不要
- `journeys/{grad}`: steps[]（id,label,desc,type, 任意で link/cta）
- `notices/{id}`: text, createdAt（全学年に表示）
- `articles/{id}`: title, body, grad(null=全学年), published, thumb, createdAt
  - `articles/{id}/images/{imgId}`: data(圧縮base64 dataURL), order
- `templates/{id}`: LINE配信テンプレ。本体は {name, body, categoryId, order}、種別(カテゴリ)は同コレクション内の {_type:"category", name, order} ドキュメントとして保持（新コレクションを作らずルール追加デプロイを回避）
- `broadcasts/{id}`: LINE/メール配信ログ。{target(表示名), body, grad, count, lineCount, mailCount, lineNames[]/mailNames[](宛先氏名), sentBy, sentAt}。管理者はread可・write不可（Admin SDK）。管理画面の「配信履歴」で表示・個別削除(`/api/broadcast-delete`)。
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
- **デプロイ遅延・キャンセル**: 連続pushすると Vercel は途中ビルドを取り消し最新だけをビルドするため、反映まで数十秒〜数分。push後は本番の `index-*.js` に目印文字列が入ったか `curl` で確認するのが確実。
- **一覧クエリはルールに合わせる**: `articles` のように per-doc条件(`published==true`)のあるコレクションは、クライアント側で `where("published","==",true)` を付けないと**学生ではクエリ全体が権限拒否**され0件になる（管理者はadminで読めるので気づきにくい）。events/surveys/articlesは published で絞る。
- **リポジトリは Public 必須**: Vercel Hobby(無料) は private リポジトリの Git 自動デプロイをブロック（`Deployment Blocked`）。private に戻すなら Pro(有料) か手動デプロイ。
- **Firebase Storage 未使用**: 新規プロジェクトは Storage が Blaze 必須。写真は image.js で圧縮し Firestore に base64 保存（1枚<1MB, 無料枠1GBで数千枚）。大量運用時は Storage/Vercel Blob へ移行余地。
- **PowerShell**: `$pid` は予約変数（プロセスID）→ 別名を使う。`Get-Content` は既定ANSIで日本語が文字化け→ `.env` 等は `[System.IO.File]::ReadAllText/WriteAllText` の UTF-8(BOMなし) を使う。node終了時の `Assertion failed ... async.c` はWindowsの無害な警告。
- **ブラウザ自動操作**: React の controlled input は mcp の form_input では onChange が発火しないことがある→ 実キー入力(type)で操作。
- **メール配信**: Firebase 既定メール(firebaseapp.com)は迷惑メール判定されやすい→ 認証コード/パスワード再設定は Resend(no-reply@monoloop.jp) 経由に統一済み。列挙保護ONのため未登録アドレスは無送信で成功表示。

## 8. 完了済み機能

**学生（StudentApp）**:
- ヘッダー(正式ロゴ)＋上部アラート(未対応タスク)。右上メニュー(≡)に **質問箱／LINE連携／プロフィール／ログアウト** を集約（下部ナビは HOME/EVENTS/SURVEY/NEWS の4つ）。
- ホーム: ループちゃん(時間帯・誕生日・イベントで出し分け＋吹き出し)、**日付・時刻のライブ時計**、進捗バー、Journey(リンク可)、直近イベント、お知らせ。
- イベント: 出欠(出席/欠席)。**未回答/回答済み/受付終了に枠分け**(回答期限=deadlineDate 超過 or 管理者の手動終了で受付終了)。**到着受付**(出席者は開催日当日以降いつでも押下可、回答締切とは独立、管理者が最終終了するまで)。回答変更時「担当者に共有」表示。**対象エリア/個別対象**に該当する学生にだけ表示。
- アンケート: **説明文(タイトル下)**・**動的設問(単一選択/複数選択/自由記述)**、未回答/回答済み/受付終了(dueDate)。**対象者限定**(全員 or 特定イベントの出席者/到着者)＋**対象エリア/個別対象**に該当する学生だけ表示。
- NEWS(記事＋写真, インスタ風=写真上/文章下, 写真保存ボタン)。**質問箱**(投稿・自分のQ&A履歴・公開FAQ)。LINE連携。
- ログイン／登録(`/signup/:year` 動的・卒年度停止対応・**フリガナ/電話郵便ハイフン必須**)／パスワード再設定(Resend＋日本語 `/reset-confirm`)。

**管理（AdminApp）**:
- 年度スイッチャー(3件横並び＋pastプルダウン)。
- 概況: 集計／**イベントCRUD**(下書き・回答期限(日付)・**対象エリア(現住所/実家/どちらも)＋個別対象者モーダル**・最終受付終了(手動)・**出欠/到着の管理側編集＋キャンセル理由**・履歴から作成)／**アンケートCRUD**(動的設問・テンプレ/履歴から作成・下書き・対象者(イベント参加者)・**説明欄(desc)**・**対象エリア(現住所/実家/どちらも)＋対象者を確認・個別調整モーダル**・回答集計/CSV・**選択式は選択肢タップで回答者一覧モーダル**)／Journey(**ドラッグ並び替え**・リンク設定)／お知らせ。
- 内定者: 配布カード・初期PW変更・卒年度追加/受付停止・**検索(名前/大学/住所/メール等)**・一覧/フィルタ・**詳細(閲覧/「編集」で連絡先編集=現住所/実家分離・電話郵便ハイフン必須・氏名/生年月日/メールは編集不可・フリガナ)**・ステータス変更(内定/承諾/辞退/承諾後辞退/**テスト**)・辞退→無効化/復元・CSV。名前は**フリガナであいうえお順**。テストアカウントは集計/配信対象外。
- 記事: 写真アップロード(自動圧縮・**画質重視 最大1600px/品質0.85/1MB枠**)・公開対象・公開/非公開・**編集**・削除・**投稿時に対象者の公式LINEへ自動通知**(任意ON)。
- 質問箱: 一覧・回答(質問者へLINE通知)・公開切替・削除・未回答バッジ。
- LINE一括配信: 対象=ステータス別／**イベント参加状況(出席者/到着者/欠席者/未回答者)**。**{name}差し込み**(個別push)。**今月の送信数(無料枠200/月・毎月リセット)表示＋超過ガード**。**配信履歴**(本文・宛先氏名・日時・件数、折りたたみ＋ページング、**個別削除**)。テンプレ管理(種別カテゴリ・並び替え・削除)。※Managerの「メッセージ配信」履歴には出ない旨の注記あり。
- 学生画面プレビュー(操作可・DB非保存)。

**LINE Webhook**: 友だち追加(follow)時・その他メッセージへの自動返信は廃止し、**連携完了時のみ**「連携が完了しました」を送信。

**基盤**: cohorts(卒年度動的化)・Security Rules全面・Resendドメイン認証・LINE(Webhook active)・Vercel本番+GitHub自動デプロイ・游ゴシック統一・配色リブランド・color-scheme:light。**新規コレクション追加を避けてルール再デプロイを回避**(questions=API経由/アンケートテンプレ・種別=templates内 _type)。

## 9. 残タスク（任意）

**完了済み（過去の残タスクから）**: 管理ヘッダーロゴを正式ロゴに差し替え済み／favicon は logo.png 化を試したが横長で崩れるため `loop.svg` に据え置き（正方形favicon用意が必要なら別途）。

**未対応・検討**
- [ ] **質問箱の実学生での通しテスト**（投稿→管理回答→LINE通知）。API経由のため一度実地確認推奨。
- [ ] **LINE公式アカウントの自動応答をOFF**（OA Manager）にして Webhook を確実に優先（推奨）。
- [ ] **独自ドメイン** `mypage.monoloop.jp` 等を使うなら Vercel でドメイン追加＋DNS(ムームー)にCNAME。
- [ ] 写真の**原本画質**が必要なら **Firebase Storage(Blaze) か Vercel Blob** へ移行（現状は1MB/枚の圧縮）。
- [ ] **Vercel 関数上限(12)** に注意。新API追加時は既存に集約するか要検討。
- [ ] **エリア判定の限界**: 住所は自由入力で「先頭の都道府県名」から判定。都道府県が入っていない住所は判定不可（エリア指定イベントに出ない）。厳密運用なら住所整備 or 都道府県の構造化を検討。
- [ ] Signup画面の問い合わせ先文言の統一を検討。
- [ ] トークン管理: GitHub PAT / Vercel トークンの削除・再発行方針。

**過去に単発対応**: 2027卒のテスト学生の完全削除スクリプト運用、記事表示の権限バグ修正(articles クエリに published 条件)、Vercel 12関数超過の解消(質問箱API統合)。

## 10. 外部アカウント/連携メモ

- Firebase: プロジェクト `ml-my-page`（承認済みドメインに `monoloop-mypage.vercel.app` 追加済み）
- Resend: 送信専用APIキー。ドメイン `monoloop.jp` 認証済み（send サブドメインにSPF/DKIM/MX、DNSはムームー）
- LINE: 新チャネル（`@241mxauu`）。Webhook `https://monoloop-mypage.vercel.app/api/line-webhook`（active:true）
- Vercel: team `monoloop` / project `monoloop-mypage`（projectId prj_yvMhIHmBibStBXuc2hoYm0N6w6CN）
- GitHub: `Monoloop9696/monoloop-mypage`（Public, default branch main）
