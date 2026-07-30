# デプロイ手順書（本番公開まで）

所要時間の目安：初回 60〜90分。上から順に進めてください。

---

## 0. 事前準備：Node.js のインストール

このプロジェクトのビルド／ローカル確認には Node.js が必要です（現在この端末には未インストール）。

1. https://nodejs.org から **LTS 版** をインストール
2. ターミナル（PowerShell）で確認：
   ```bash
   node -v
   npm -v
   ```

---

## 1. Firebase の設定

対象プロジェクト：`ml-my-page`（`.env` に設定済み）

### 1-1. Authentication
1. Firebase コンソール → 構築 → Authentication → 始める
2. ログイン方法で **メール/パスワード** を有効化
3. （任意）設定 → ユーザーアクション → メール列挙保護は ON のままで問題ありません

### 1-2. Firestore Database
1. 構築 → Firestore Database → データベースを作成（本番モード、リージョンは `asia-northeast1` 推奨）
2. ルールを反映：
   - Firebase CLI を使う場合：
     ```bash
     npm i -g firebase-tools
     firebase login
     firebase deploy --only firestore:rules --project ml-my-page
     ```
   - もしくはコンソールの「ルール」タブに `firestore.rules` の内容を貼り付けて公開

### 1-3. サービスアカウント鍵（サーバー処理に必須）
1. コンソール → プロジェクトの設定（歯車）→ **サービス アカウント**
2. 「新しい秘密鍵を生成」→ JSON をダウンロード
3. JSON を**1行に圧縮**して `.env` の `FIREBASE_SERVICE_ACCOUNT` に貼り付け
   （改行が入る場合は base64 化して貼ってもOK。どちらの形式でも読み込めます）

   ```bash
   # 1行JSONにする例（Git Bash / macOS / Linux）
   cat serviceAccount.json | tr -d '\n'
   # base64 にする例
   base64 -w0 serviceAccount.json
   ```

> ⚠️ この鍵は最高権限です。絶対にコミット・共有しないでください（`.gitignore` 済み）。

### 1-4. 管理者アカウントの作成
1. コンソール → Authentication → ユーザー → ユーザーを追加
2. `ADMIN_EMAILS`（`jinji1@monoloop.co.jp` / `imai.syuto@monoloop.co.jp`）をメールに、任意の初期パスワードで作成
   （本人は初回ログイン後に「パスワードをお忘れの方」から再設定できます）

---

## 2. 初期データ投入（Journey ＆ 管理者クレーム）

`.env` に `FIREBASE_SERVICE_ACCOUNT` と `ADMIN_EMAILS` を設定した状態で：

```bash
npm install
npm run seed
```

- `journeys/2027`・`journeys/2028` の初期ステップが作成されます
- 手順1-4で作成済みの管理者アカウントに `admin` クレームが付与されます
  （後から管理者を追加した場合は再度 `npm run seed` を実行）

---

## 3. Resend の設定

`.env` の `RESEND_API_KEY` は設定済みです。送信元は当面 `onboarding@resend.dev`（`MAIL_FROM`）で動作します。

- 独自ドメイン（例：`@monoloop.jp`）から送りたい場合は Resend でドメイン認証（SPF/DKIM）を行い、`MAIL_FROM` を差し替えてください。到達率が向上します。

---

## 4. GitHub へ push

```bash
cd monoloop-mypage
git init
git add .
git commit -m "モノ・ループ内定者マイページ 初期実装"
# GitHub で空リポジトリを作成後
git remote add origin https://github.com/＜あなた＞/monoloop-mypage.git
git branch -M main
git push -u origin main
```

`.env` は `.gitignore` により push されません（想定どおり）。

---

## 5. Vercel へデプロイ

1. https://vercel.com にログイン → Add New → Project → 手順4のリポジトリを Import
2. Framework Preset は **Vite** が自動検出されます（Build: `vite build` / Output: `dist`）
3. **Environment Variables** に `.env` の全項目を登録
   （`VITE_*` も含めすべて。特に `FIREBASE_SERVICE_ACCOUNT` を忘れずに）
4. Deploy を実行 → `https://＜プロジェクト＞.vercel.app` が本番URLになります

> 学生への配布URL（`/signup/2027` 等）は、アプリが自動的に現在のドメインを使って生成します。独自ドメインを割り当てた場合も設定変更は不要です。

### Firebase の承認済みドメイン
Firebase コンソール → Authentication → 設定 → 承認済みドメイン に、Vercel のドメイン（`＜プロジェクト＞.vercel.app` と独自ドメイン）を追加してください。ログインに必要です。

---

## 6. LINE の設定

1. LINE Developers → 対象チャネル → Messaging API 設定
2. **Webhook URL** に `https://＜本番ドメイン＞/api/line-webhook` を設定し、「Webhookの利用」を ON
3. 「応答メッセージ」は OFF、「あいさつメッセージ」は任意
4. 学生に配る「友だち追加URL」を取得し、`.env`（および Vercel）の `VITE_LINE_ADD_FRIEND_URL` に設定
   （例：`https://line.me/R/ti/p/@xxxxxxx`）。設定するとマイページに友だち追加ボタンが表示されます。
5. 「検証」ボタンで Webhook 疎通を確認

---

## 7. 本番テスト（受け入れ確認）

- [ ] `/signup/2027` から登録（初期PW照合 → 認証コードメール受信 → 本人情報＋PW設定 → 完了）
- [ ] 誤った初期PW／別年度のPWで正しくエラーが出る
- [ ] 登録済みメールで再登録するとログインへ誘導される
- [ ] ログイン／パスワード再設定メール
- [ ] 学生：イベント出欠、アンケート回答、進捗バー更新、LINE連携コード表示
- [ ] LINEで連携コード（MN-XXXX）を送信 → 連携完了メッセージ、マイページが「連携済み」に
- [ ] 管理者ログイン → 概況・内定者一覧・詳細モーダル・ステータス変更
- [ ] 辞退に変更 → 確認モーダル → ログイン不可（Auth無効化）→ 復元で戻る
- [ ] イベント／アンケート作成（下書き→公開）、テンプレ保存＋プレビュー
- [ ] CSVエクスポート（学生一覧・出欠・アンケート回答）
- [ ] LINE一括配信（未連携者にメール、`broadcasts` にログ）

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| 管理者でログインしても学生画面になる | `npm run seed` で管理者クレーム付与済みか確認。付与直後は一度ログアウト→再ログイン |
| 認証コードメールが届かない | Resend のダッシュボードで送信ログを確認。迷惑メールも確認。`MAIL_FROM` のドメイン認証を検討 |
| LINE連携で「signature invalid」 | Webhook URL が正しいか、`LINE_CHANNEL_SECRET` が一致しているか確認 |
| `/api/*` が 500 | Vercel の Environment Variables（特に `FIREBASE_SERVICE_ACCOUNT`）を確認。Functions ログを参照 |
| Firestore で権限エラー | ルールがデプロイ済みか、`students` ドキュメントが作成済みかを確認 |
