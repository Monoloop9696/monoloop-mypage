# Resend ドメイン認証 手順ガイド

目的：認証コードメール等を **実際の内定者（gmail 等どのアドレスにも）** 届けられるようにする。
現状は送信元 `onboarding@resend.dev`（サンドボックス）で、Resend登録アドレス以外には配信できない。

所要：作業10分 ＋ DNS反映待ち（数分〜最大48時間、通常は数十分）。

---

## 前提

- **`monoloop.jp` のDNSを編集できること**（お名前.com / Cloudflare / Route53 / さくら等の管理画面）。
- Resend アカウントにログインできること（このプロジェクトのAPIキー発行元）。

---

## STEP 1. Resend にドメインを追加

1. https://resend.com/domains を開く
2. **「Add Domain」** をクリック
3. Domain 欄に **`monoloop.jp`** を入力
   - ※ ルートドメイン（`monoloop.jp`）を認証すれば送信元を `no-reply@monoloop.jp` にできます（推奨）。
   - サブドメイン運用にしたい場合は `send.monoloop.jp` 等でも可（その場合 From も同ドメインに）。
4. Region は **Tokyo (ap-northeast-1)** を選択（選べる場合。日本向けで最適）
5. 「Add」→ 認証用の **DNSレコード一覧** が表示されます

---

## STEP 2. 表示されたDNSレコードを DNS に登録

Resend が表示する **3〜4種類のレコード**を、DNS管理画面にそのまま追加します。
**値（特にDKIMの `p=...`）はドメインごとに固有なので、Resendの画面から必ずコピー**してください。

登録するレコードの種類（`monoloop.jp` の例）：

| 種別 | ホスト/名前 | 値（例／Resendの表示を優先） |
| --- | --- | --- |
| **MX** | `send` | `feedback-smtp.ap-northeast-1.amazonses.com`（優先度 10） |
| **TXT (SPF)** | `send` | `v=spf1 include:amazonses.com ~all` |
| **TXT (DKIM)** | `resend._domainkey` | `p=MIGfMA0GCSq...`（★Resend画面の長い値をコピー） |
| **TXT (DMARC 任意)** | `_dmarc` | `v=DMARC1; p=none;` |

登録のコツ：
- 「ホスト/名前」は多くのDNSで **ドメイン部分を除いた相対名**（例：`send`、`resend._domainkey`）を入れます。
  管理画面によっては末尾に自動で `.monoloop.jp` が付きます。**二重に付けない**よう注意。
- 既存のSPF（`v=spf1 ...`）が **ルート `monoloop.jp` に既にある場合**でも、上記SPFは `send` サブドメイン向けなので競合しません。ルートのSPFはそのままでOK。
- TTL は既定（3600 等）で問題ありません。

---

## STEP 3. Resend で「Verify」

1. DNS登録後、Resend のドメイン画面に戻り **「Verify DNS Records」** をクリック
2. 各レコードが緑（Verified）になれば完了。反映に時間がかかる場合は数分〜数十分後に再度Verify。
3. ドメインのステータスが **`Verified`** になればメール配信の制限が解除されます。

---

## STEP 4. アプリの送信元（MAIL_FROM）を差し替え

`.env` と **Vercel の環境変数** の両方の `MAIL_FROM` を、認証したドメインのアドレスに変更します。

推奨値（例）：
```
MAIL_FROM="モノ・ループ採用 <no-reply@monoloop.jp>"
```
- `no-reply@monoloop.jp` はメールボックスが存在しなくても送信可（受信専用にしないなら任意アドレスでOK）。
- 表示名（`モノ・ループ採用`）は付けても付けなくても可。

> ローカルの `.env` は私の方で更新できます（希望の送信元アドレスを教えてください）。
> Vercel 側は、デプロイ後に Vercel の Project → Settings → Environment Variables でも同じ値に更新し、再デプロイします。

---

## STEP 5. 配信テスト

- `MAIL_FROM` 差し替え後、`/signup/2027` から任意のアドレス（gmail 等）で登録 → **認証コードメールが届けば成功**。
- 届かない場合：Resend の Logs（https://resend.com/emails）で送信結果・エラーを確認。迷惑メールフォルダも確認。

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| Verify が緑にならない | DNS反映待ち（時間をおく）／ホスト名の二重付与（`resend._domainkey.monoloop.jp.monoloop.jp` 等）を確認 |
| 送信は成功するが迷惑メール判定 | DMARC レコード追加、送信元の表示名・本文を整える、ドメイン評価が上がるまで待つ |
| `restricted_api_key` エラー | 現APIキーは送信専用（正常）。ドメイン操作はダッシュボードで実施 |
| 特定ドメインにだけ届かない | 受信側のフィルタ。Resend Logs で `delivered`/`bounced` を確認 |
