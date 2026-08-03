import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "../firebase";
import { PAPER, ROSE, IVORY, GOLD, HAIR, MUTE, studentFontStyle, caps } from "../theme";

// パスワード再設定の確定ページ（Firebaseの英語ページの代わりに日本語で表示）
export default function ResetConfirm() {
  const [params] = useSearchParams();
  const oobCode = params.get("oobCode");
  const [state, setState] = useState("checking"); // checking | ready | invalid | done
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inp = { border: `1px solid ${HAIR}` };

  useEffect(() => {
    if (!oobCode) { setState("invalid"); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then(() => setState("ready"))
      .catch(() => setState("invalid"));
  }, [oobCode]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (pw1.length < 8) { setErr("パスワードは8文字以上で設定してください。"); return; }
    if (pw1 !== pw2) { setErr("確認用のパスワードが一致しません。"); return; }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, pw1);
      setState("done");
    } catch {
      setErr("リンクの有効期限が切れているか、無効です。お手数ですが再度お手続きください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      <div className="max-w-md mx-auto px-6 pt-16 pb-16 ml-in">
        <p style={caps(10, GOLD)}>Password reset</p>
        <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 23 }}>新しいパスワードの設定</h1>

        {state === "checking" && (
          <p className="text-sm mt-6" style={{ color: MUTE }}>リンクを確認しています…</p>
        )}

        {state === "invalid" && (
          <>
            <p className="text-sm mt-6 leading-relaxed" style={{ color: "#C0264B" }}>
              このリンクは無効か、有効期限が切れています。
            </p>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
              再設定メールの再送をご希望の場合は、下のリンクからもう一度お手続きください。
            </p>
            <Link to="/reset" className="inline-block mt-8 py-3.5 px-8 text-sm font-bold" style={{ background: ROSE, color: IVORY }}>
              再設定メールを送り直す
            </Link>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
              新しいパスワードを設定してください（8文字以上）。
            </p>
            <form className="mt-8 space-y-4" onSubmit={submit}>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>新しいパスワード</p>
                <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)}
                  autoComplete="new-password" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>新しいパスワード（確認）</p>
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              {err && <p className="text-xs font-bold" style={{ color: "#C0264B" }}>{err}</p>}
              <button type="submit" disabled={!pw1 || !pw2 || busy}
                className="w-full py-3.5 text-sm font-bold disabled:opacity-40" style={{ background: ROSE, color: IVORY }}>
                {busy ? "設定中…" : "パスワードを変更する"}
              </button>
            </form>
          </>
        )}

        {state === "done" && (
          <>
            <p className="text-sm mt-6 leading-relaxed">パスワードを変更しました。</p>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
              新しいパスワードでログインしてください。
            </p>
            <Link to="/login" className="inline-block mt-8 py-3.5 px-8 text-sm font-bold" style={{ background: ROSE, color: IVORY }}>
              ログイン画面へ
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
