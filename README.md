# モノ・ループ 内定者マイページ

内定者向けマイページ（学生ビュー）と採用管理コンソール（人事ビュー）を1つにまとめた本番運用向けWebアプリです。プロトタイプ（`monoloop-mypage.jsx`）のデザイン・機能をそのまま実装し、バックエンドを Firebase / Resend / LINE / Vercel で構成しています。

- **本番URL**: https://monoloop-mypage.vercel.app
- **リポジトリ**: GitHub（private）。`main` への push で Vercel が自動デプロイ。

## 技術スタック（すべて無料枠で構成可能）

| 領域 | 採用技術 |
| --- | --- |
| フロント | React + Vite + Tailwind CSS |
| 認証 / DB | Firebase Authentication + Cloud Firestore（Sparkプラン） |
| メール | Resend（認証コード・未連携者への一括メール） |
| サーバー処理 | Vercel Serverless Functions（`/api/*`） |
| LINE | Messaging API（友だち連携・一括配信） |
| ホスティング | Vercel |

## 画面と権限

- **ロールで画面を分離**：`ADMIN_EMAILS` に含まれるメールでログインすると管理コンソール、それ以外の登録済み学生は学生マイページが表示されます。プロトタイプにあった「学生/人事 切替トグル」「デモ用ヒント」「モックデータ」はすべて削除済みです。
- 権限は **画面表示だけでなく Firestore Security Rules（`firestore.rules`）で強制** します。学生がURLを直打ちしても他人・管理データには一切アクセスできません。

## ディレクトリ構成

```
monoloop-mypage/
├── index.html / vite.config.js / tailwind.config.js / postcss.config.js
├── .env                … 秘密情報（コミット禁止・.gitignore済み）
├── .env.example        … 変数テンプレート
├── firestore.rules     … セキュリティルール
├── vercel.json         … SPA リライト + Functions 設定
├── scripts/seed.mjs    … 初期データ投入 & 管理者クレーム付与
├── src/
│   ├── firebase.js           … Firebase クライアント初期化
│   ├── auth/AuthContext.jsx  … ログイン状態・ロール判定
│   ├── lib/                  … firestore.js / api.js / csv.js
│   ├── components/common.jsx
│   └── pages/  Login / Signup / ResetPassword / Privacy / StudentApp / AdminApp
└── api/                … Serverless Functions
    ├── _lib/            … firebaseAdmin / util / resend / line
    ├── send-code.js     … 初期PW照合＋認証コード送信
    ├── register.js      … コード検証＋アカウント作成
    ├── set-role.js      … 管理者クレーム付与
    ├── admin-config.js  … 初期パスワード表示（管理者限定）
    ├── student-account.js … 退会/復元（Auth無効化）
    ├── line-webhook.js  … 友だち追加・連携コード受信
    └── line-broadcast.js … 一括配信（未連携者はメール）
```

## ローカル開発

> このプロジェクトには Node.js（18以上）が必要です。未インストールの場合は https://nodejs.org からLTS版を入れてください。

```bash
npm install
```

### フロントのみ確認する

```bash
npm run dev
```

`http://localhost:5173` が開きます。Firebase 直結の画面（ログイン・学生/管理の各画面）は動作しますが、`/api/*`（認証コード送信・LINE・退会処理・初期PW表示）は動きません。

### API も含めて確認する（推奨）

Vercel CLI を使うと `/api/*` もローカルで動きます。

```bash
npm i -g vercel
vercel dev
```

`.env` の値がそのまま読み込まれます。

## 環境変数

`.env`（と Vercel の Environment Variables）に設定します。`VITE_` 接頭辞の付いた変数のみブラウザに露出します（Firebase の公開設定なので問題ありません）。それ以外はサーバー専用シークレットです。

`.env.example` を参照してください。**`FIREBASE_SERVICE_ACCOUNT` だけは別途取得が必要**です（→ `DEPLOY.md`）。

## データモデル（Firestore）

| コレクション | 主なフィールド |
| --- | --- |
| `cohorts/{year}` | year, initialPassword, joinDate(Timestamp=year/4/1), active ※**管理者のみ読み取り可** |
| `students/{uid}` | name, univ, birth, email, phone, zip, address, grad, joinDate, status, deleted, lineUserId, linkCode, createdAt |
| `events/{id}` | title, dateStr, time, date(Timestamp), place, deadline, copy, grad, published |
| `rsvps/{eventId}_{uid}` | eventId, uid, answer(yes/no), updatedAt |
| `surveys/{id}` | title, due, time, q1, opts[], q2, multi, grad, published |
| `responses/{surveyId}_{uid}` | surveyId, uid, q1[], q2, submittedAt |
| `journeys/{grad}` | steps[]（id, label, desc, type） |
| `templates/{id}` | name, body, createdBy |
| `broadcasts/{id}` | target, body, count, lineCount, mailCount, sentAt |
| `authCodes/{email}` | code, grad, expiresAt, passwordOk（サーバー専用） |

## セキュリティ上の注意

- 個人情報を扱うため `console.log` への個人情報出力は行っていません。`.env` はコミット禁止（`.gitignore` 済み）。
- 認証コードは10分で失効。アカウント作成はサーバー側で「初期パスワード照合＋コード検証」を通過した場合のみ行われます。
- Cloud Storage（ファイル保存）は無料枠対象外のため未使用です（書類アップロードは将来の課金プランで追加）。

デプロイ手順は **`DEPLOY.md`** を参照してください。
