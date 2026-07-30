import { Link } from "react-router-dom";
import { PAPER, ROSE, GOLD, HAIR, MUTE, INK, studentFontStyle, caps } from "../theme";

// プライバシーポリシー（モノ・ループ株式会社）
export default function Privacy() {
  const H = ({ children }) => (
    <h2 className="jp-mincho font-bold mt-8 mb-2" style={{ fontSize: 16, color: INK }}>
      {children}
    </h2>
  );
  const P = ({ children }) => (
    <p className="text-sm leading-relaxed" style={{ color: "#4A3A40" }}>
      {children}
    </p>
  );

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      <div className="max-w-md mx-auto px-6 pt-14 pb-20">
        <p style={caps(10, GOLD)}>Privacy Policy</p>
        <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 22 }}>プライバシーポリシー</h1>
        <div className="mt-4" style={{ height: 1, background: HAIR }} />

        <P>
          モノ・ループ株式会社（以下「当社」）は、内定者マイページ（以下「本サービス」）において取得する
          個人情報を、以下の方針に基づき適切に取り扱います。
        </P>

        <H>1. 取得する情報</H>
        <P>
          氏名・生年月日・住所・電話番号・メールアドレス・大学名・LINE識別子、および本サービス上での
          出欠・アンケート等の回答内容を取得します。
        </P>

        <H>2. 利用目的</H>
        <P>
          取得した個人情報は、入社手続き・ご連絡・イベント運営、および内定者フォローの目的にのみ利用します。
        </P>

        <H>3. 第三者提供</H>
        <P>
          当社は、法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。
        </P>

        <H>4. 業務委託</H>
        <P>
          利用目的の達成に必要な範囲で、認証・メール配信・ホスティング等の外部サービス
          （Google Firebase、Resend、Vercel、LINE 等）に処理を委託する場合があります。委託先には
          適切な管理を求めます。
        </P>

        <H>5. 安全管理</H>
        <P>
          個人情報への不正アクセス・漏えい・滅失・毀損の防止のため、必要かつ適切な安全管理措置を講じます。
        </P>

        <H>6. 開示・訂正・削除</H>
        <P>
          ご本人からの開示・訂正・利用停止・削除のご請求には、法令に従い適切に対応します。
        </P>

        <H>7. お問い合わせ窓口</H>
        <P>
          モノ・ループ株式会社 採用担当<br />
          〒450-0002 愛知県名古屋市中村区名駅3-22-8 大東海ビル3階<br />
          メール：imai.syuto@monoloop.jp
        </P>

        <p className="text-xs mt-8" style={{ color: MUTE }}>制定日：2026年7月28日</p>

        <Link
          to="/login"
          className="inline-block mt-8 text-xs font-bold"
          style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}
        >
          ← 戻る
        </Link>
      </div>
    </div>
  );
}
