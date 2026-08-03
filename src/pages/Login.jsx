import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { PAPER, ROSE, IVORY, MAUVE, GOLD, HAIR, MUTE, studentFontStyle, caps } from "../theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inp = { border: `1px solid ${HAIR}` };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      // 遷移は App のルーティングが担当
    } catch (ex) {
      const code = ex.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setErr("メールアドレスまたはパスワードが正しくありません。");
      } else if (code === "auth/too-many-requests") {
        setErr("試行回数が多すぎます。しばらく時間をおいて再度お試しください。");
      } else if (code === "auth/user-disabled") {
        setErr("このアカウントは現在ご利用いただけません。採用担当までお問い合わせください。");
      } else {
        setErr("ログインに失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      <div className="max-w-md mx-auto px-6 pt-16 pb-16 ml-in">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="モノ・ループ" className="shrink-0" style={{ height: 24, width: "auto" }} />
          <div>
            <p className="en-serif font-bold leading-none" style={{ fontSize: 16, fontStyle: "italic", color: ROSE }}>
              Monoloop
            </p>
            <p className="leading-none mt-1" style={caps(8, MAUVE, "0.2em")}>My Page</p>
          </div>
        </div>

        <p className="mt-12" style={caps(10, GOLD)}>Sign in</p>
        <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 23 }}>マイページにログイン</h1>
        <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
          ご登録済みのメールアドレスとパスワードを入力してください。
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
          <div>
            <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>パスワード</p>
            <input
              type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              className="w-full p-3.5 text-sm bg-white" style={inp}
            />
          </div>

          {err && <p className="text-xs font-bold" style={{ color: "#C0264B" }}>{err}</p>}

          <button
            type="submit" disabled={!email || !pw || busy}
            className="w-full py-3.5 text-sm font-bold disabled:opacity-40"
            style={{ background: ROSE, color: IVORY }}
          >
            {busy ? "確認中…" : "ログイン"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
          <Link to="/reset" className="text-xs font-bold" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
            パスワードをお忘れの方
          </Link>
        </div>

        <div className="mt-10 pt-5" style={{ borderTop: `1px solid ${HAIR}` }}>
          <p className="text-xs leading-relaxed" style={{ color: MUTE }}>
            まだ登録がお済みでない方は、採用担当からご案内した登録用URLからお手続きください。<br />
            ご不明な場合は採用担当（モノ・ループLINEグループ）までご連絡ください。
          </p>
        </div>
      </div>
    </div>
  );
}
