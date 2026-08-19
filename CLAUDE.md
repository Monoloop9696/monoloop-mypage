# CLAUDE.md — モノ・ループ内定者マイページ 開発メモ

このファイルは、プロジェクトの現状・構成・運用手順・残タスクをまとめた作業引き継ぎ用ドキュメントです。

最終更新: 2026-08-04

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
    csv.js               CSV出力
    image.js             画像圧縮（fileToCompressedDataURL / dataUrlToThumb / downloadDataUrl）
  components/common.jsx  SectionTitle / EdHeader / FullLoader
  pages/
    Login / Signup（/signup/:year 動的）/ ResetPassword / ResetConfirm（日本語再設定）
    Privacy / StudentApp（学生）/ AdminApp（管理）
api/
  _lib/ firebaseAdmin.js（SA初期化）/ util.js / resend.js / line.js
  send-code / register / set-role / student-account / public-cohorts /
  reset-password / line-webhook / line-broadcast
firestore.rules          セキュリティルール（firebaserules REST APIでデプロイ）
scripts/seed.mjs         cohorts/journeys 初期投入・admin クレーム付与
public/ logo.png loop.svg loopchan/loopchan-1〜8.png
```

## 4. データモデル（Firestore）

- `students/{uid}`: name, kana(フリガナ・あいうえお順の並び替えに使用), univ, birth, email, phone, zip, address, livesAtHome, homeZip, homeAddress, grad, joinDate, status(内定/承諾/辞退/承諾後辞退), deleted, lineUserId, linkCode, createdAt
- `cohorts/{year}`: year, initialPassword, joinDate, active ※**管理者のみ読取可**（初期PWを含む）
- `events/{id}`: title, dateStr, time, date(Timestamp), place, deadlineDate(YYYY-MM-DD・出欠受付の締切／未設定は開催日基準), deadline(表示ラベル), copy, grad, published(false=下書き)。※期限超過で学生側は受付終了へ。到着ボタンは締切後でも開催日当日は押下可
- `rsvps/{eventId}_{uid}`: eventId, uid, answer(yes/no)
- `surveys/{id}`: title, dueDate(YYYY-MM-DD・自動終了), due(表示ラベル), time, **questions[]**（{id,type:single/multi/text,label,options[],required}）, grad, published(false=下書き)。※旧形式 q1/opts[]/multi/q2 も後方互換で表示可（`surveyQuestions()` が吸収）
- `responses/{surveyId}_{uid}`: surveyId, uid, **answers**（{[questionId]: 配列=選択 / 文字列=記述}）。旧形式 q1[]/q2 は `responseAnswers()` で吸収
- アンケートのテンプレは `templates` コレクションに `_type:"surveyTemplate"`（{name, data:{title,time,questions}}・回答期限は保存しない）で保存＝ルール追加不要
- `journeys/{grad}`: steps[]（id,label,desc,type, 任意で link/cta）
- `notices/{id}`: text, createdAt（全学年に表示）
- `articles/{id}`: title, body, grad(null=全学年), published, thumb, createdAt
  - `articles/{id}/images/{imgId}`: data(圧縮base64 dataURL), order
- `templates/{id}`: LINE配信テンプレ。本体は {name, body, categoryId, order}、種別(カテゴリ)は同コレクション内の {_type:"category", name, order} ドキュメントとして保持（新コレクションを作らずルール追加デプロイを回避）
- `broadcasts/{id}` / `authCodes/{email}`(サーバー専用)
- `questions/{id}`: 質問箱。{uid, name, grad, text, answer, answeredAt, answeredBy, public, createdAt}。**クライアントは直接触らず、必ず serverless API 経由**（`/api/question-ask`＝学生投稿, `/api/question-list`＝一覧, `/api/question-answer`＝管理者の回答/公開/削除）。Admin SDK で読み書きするため Firestore ルール追加が不要。回答時は質問者の公式LINEへ通知（連携時）。

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

## 7. ハマりどころ（既知）

- **リポジトリは Public 必須**: Vercel Hobby(無料) は private リポジトリの Git 自動デプロイをブロック（`Deployment Blocked`）。private に戻すなら Pro(有料) か手動デプロイ。
- **Firebase Storage 未使用**: 新規プロジェクトは Storage が Blaze 必須。写真は image.js で圧縮し Firestore に base64 保存（1枚<1MB, 無料枠1GBで数千枚）。大量運用時は Storage/Vercel Blob へ移行余地。
- **PowerShell**: `$pid` は予約変数（プロセスID）→ 別名を使う。`Get-Content` は既定ANSIで日本語が文字化け→ `.env` 等は `[System.IO.File]::ReadAllText/WriteAllText` の UTF-8(BOMなし) を使う。node終了時の `Assertion failed ... async.c` はWindowsの無害な警告。
- **ブラウザ自動操作**: React の controlled input は mcp の form_input では onChange が発火しないことがある→ 実キー入力(type)で操作。
- **メール配信**: Firebase 既定メール(firebaseapp.com)は迷惑メール判定されやすい→ 認証コード/パスワード再設定は Resend(no-reply@monoloop.jp) 経由に統一済み。列挙保護ONのため未登録アドレスは無送信で成功表示。

## 8. 完了済み機能

**学生（StudentApp）**: ヘッダー(正式ロゴ)＋上部アラート(未回答等)／ホーム(ループちゃん=時間帯・誕生日・イベントで出し分け＋吹き出し、進捗バー、Journey=手入力ステップもリンク可、直近イベント、お知らせ)／イベント(出欠)／アンケート／**NEWS(記事＋写真, インスタ風=写真上/文章下, 写真保存ボタン)**／LINE連携。ログイン／登録(`/signup/:year` 動的・卒年度停止対応)／パスワード再設定(Resend＋日本語 `/reset-confirm`)。

**管理（AdminApp）**: 年度スイッチャー(3件横並び＋古い年度はpastプルダウン)／概況(集計・イベントCRUD＋下書き・アンケートCRUD・**イベント/アンケート削除(関連データも)**・Journey編集(リンク先設定)・お知らせ投稿)／内定者(配布カード=選択年度のみ・**初期PW変更**・卒年度追加/受付停止・一覧/フィルタ/詳細/ステータス変更/辞退→無効化/復元・CSV)／**記事(写真アップロード=自動圧縮・公開対象・公開/非公開・削除)**／LINE一括配信／**学生画面プレビュー**。

**基盤**: cohorts(卒年度動的化)・Security Rules全面(cohortsは管理者のみ)・Resendドメイン認証・LINE(トークン/シークレット/友だち追加URL/Webhook active)・Vercel本番+GitHub自動デプロイ・游ゴシック統一・配色リブランド・color-scheme:light(スマホのダークモード反転対策)。

## 9. 残タスク（任意）

- [ ] **管理コンソールのヘッダーロゴ**を正式ロゴ(logo.png)に差し替え（現在は簡易マーク・「モノループ 採用管理コンソール」）
- [ ] **favicon** を logo.png ベースに変更（現在 `public/loop.svg`）
- [ ] **Signup画面の問い合わせ先**文言（現在 `imai.syuto@monoloop.jp`。ログインは「モノ・ループLINEグループ」に変更済み）を揃えるか検討
- [ ] **LINE公式アカウントの自動応答をOFF**（OA Manager）にして Webhook を確実に優先（推奨）
- [ ] **独自ドメイン** `mypage.monoloop.jp` 等を使うなら Vercel でドメイン追加＋DNS(ムームー)にCNAME
- [ ] 写真を大量/高解像で長期運用するなら **Firebase Storage(Blaze) か Vercel Blob** へ移行
- [ ] **本番での通し確認**（登録→メール→管理→LINE連携→配信→記事投稿→写真保存）
- [ ] トークン管理: GitHub PAT / Vercel トークンは使用後の削除・再発行方針を決める

## 10. 外部アカウント/連携メモ

- Firebase: プロジェクト `ml-my-page`（承認済みドメインに `monoloop-mypage.vercel.app` 追加済み）
- Resend: 送信専用APIキー。ドメイン `monoloop.jp` 認証済み（send サブドメインにSPF/DKIM/MX、DNSはムームー）
- LINE: 新チャネル（`@241mxauu`）。Webhook `https://monoloop-mypage.vercel.app/api/line-webhook`（active:true）
- Vercel: team `monoloop` / project `monoloop-mypage`（projectId prj_yvMhIHmBibStBXuc2hoYm0N6w6CN）
- GitHub: `Monoloop9696/monoloop-mypage`（Public, default branch main）
