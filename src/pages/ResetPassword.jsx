import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { PAPER, ROSE, IVORY, GOLD, HAIR, MUTE, studentFontStyle, caps } from "../theme";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inp = { border: `1px solid ${HAIR}` };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      // 存在しないメールでも同じ表示にして、登録有無を漏らさない
      setSent(true);
    } catch (ex) {
      if (ex.code === "auth/invalid-email") {
        setErr("メールアドレスの形式が正しくありません。");
      } else if (ex.code === "auth/user-not-found") {
        setSent(true);
      } else {
        setErr("送信に失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      <div className="max-w-md mx-auto px-6 pt-16 pb-16 ml-in">
        <p style={caps(10, GOLD)}>Password reset</p>
        <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 23 }}>パスワードの再設定</h1>

        {sent ? (
          <>
            <p className="text-sm mt-6 leading-relaxed">
              入力されたメールアドレス宛に、パスワード再設定用のメールを送信しました。
            </p>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
              メールが届かない場合は、迷惑メールフォルダをご確認いただくか、アドレスをご確認のうえ再度お試しください。
            </p>
            <Link
              to="/login"
              className="inline-block mt-8 py-3.5 px-8 text-sm font-bold"
              style={{ background: ROSE, color: IVORY }}
            >
              ログイン画面へ戻る
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
              ご登録のメールアドレスを入力してください。再設定用のリンクをお送りします。
            </p>
            <form className="mt-8 space-y-4" onSubmit={submit}>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>メールアドレス</p>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" placeholder="you@example.com"
                  className="w-full p-3.5 text-sm bg-white" style={inp}
                />
              </div>
              {err && <p className="text-xs font-bold" style={{ color: "#C0264B" }}>{err}</p>}
              <button
                type="submit" disabled={!email || busy}
                className="w-full py-3.5 text-sm font-bold disabled:opacity-40"
                style={{ background: ROSE, color: IVORY }}
              >
                {busy ? "送信中…" : "再設定メールを送信"}
              </button>
            </form>
            <Link to="/login" className="inline-block mt-6 text-xs font-bold" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
              ログイン画面へ戻る
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
