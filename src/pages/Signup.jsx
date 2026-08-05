import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { sendCode, registerAccount, publicCohorts } from "../lib/api";
import { PAPER, ROSE, IVORY, GOLD, HAIR, MUTE, studentFontStyle, caps } from "../theme";

export default function Signup({ year }) {
  const grad = year; // 以降の grad 参照を年度として扱う
  const navigate = useNavigate();
  // 年度の有効性: "loading" | "ok" | "inactive" | "missing" | "error"
  const [cohortState, setCohortState] = useState("loading");

  useEffect(() => {
    let alive = true;
    publicCohorts()
      .then(({ cohorts }) => {
        if (!alive) return;
        const c = (cohorts || []).find((x) => x.year === year);
        setCohortState(!c ? "missing" : c.active ? "ok" : "inactive");
      })
      .catch(() => alive && setCohortState("error"));
    return () => {
      alive = false;
    };
  }, [year]);
  const [regStep, setRegStep] = useState(1);
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");
  const [code, setCode] = useState("");
  const [changeEmail, setChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [f, setF] = useState({ name: "", kana: "", birth: "", univ: "", phone: "", zip: "", address: "", homeZip: "", homeAddress: "" });
  const [livesAtHome, setLivesAtHome] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [consent, setConsent] = useState(false);
  const [regError, setRegError] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  const inp = { border: `1px solid ${HAIR}` };
  const stepTitles = ["マイページ登録", "メール認証", "本人情報の登録"];

  // Step1: 初期パスワード照合＋認証コード送信（サーバー）
  const checkInitialPw = async () => {
    setRegError("");
    setAlreadyRegistered(false);
    if (!regEmail.includes("@")) {
      setRegError("メールアドレスの形式が正しくありません。");
      return;
    }
    setBusy(true);
    try {
      await sendCode({ email: regEmail.trim(), initialPassword: regPw, grad });
      setRegStep(2);
    } catch (ex) {
      if (ex.code === "already-registered") {
        setAlreadyRegistered(true);
        setRegError("このメールアドレスは登録済みです。ログイン画面よりお進みください。");
      } else {
        setRegError(ex.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendMsg("");
    setRegError("");
    setBusy(true);
    try {
      await sendCode({ email: regEmail.trim(), initialPassword: regPw, grad });
      setResendMsg("認証コードを再送しました。");
    } catch (ex) {
      setRegError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  // Step2: コードは登録確定時にサーバーで最終検証。ここでは桁数チェックのみで次へ
  const checkCode = () => {
    if (code.length < 6) {
      setRegError("認証コードは6桁で入力してください。");
      return;
    }
    setRegError("");
    setRegStep(3);
  };

  // Step3: アカウント作成
  const completeReg = async () => {
    setRegError("");
    if (!f.name || !f.kana || !f.birth || !f.univ || !f.phone || !f.address) {
      setRegError("必須項目をすべて入力してください。");
      return;
    }
    if (!livesAtHome && !f.homeAddress.trim()) {
      setRegError("実家の住所を入力してください（実家にお住まいの場合はチェックを入れてください）。");
      return;
    }
    if (changeEmail && !newEmail.includes("@")) {
      setRegError("変更後のメールアドレスの形式が正しくありません。");
      return;
    }
    if (pw1.length < 8) {
      setRegError("パスワードは8文字以上で設定してください。");
      return;
    }
    if (pw1 === regPw) {
      setRegError("初期パスワードとは別のパスワードを設定してください。");
      return;
    }
    if (pw1 !== pw2) {
      setRegError("確認用のパスワードが一致しません。");
      return;
    }
    if (!consent) {
      setRegError("プライバシーポリシーへの同意が必要です。");
      return;
    }
    const accountEmail = (changeEmail ? newEmail : regEmail).trim();
    setBusy(true);
    try {
      await registerAccount({
        inviteEmail: regEmail.trim(),
        code: code.trim(),
        grad,
        accountEmail,
        password: pw1,
        privacyConsent: true,
        profile: {
          name: f.name.trim(),
          kana: f.kana.trim(),
          birth: f.birth,
          univ: f.univ.trim(),
          phone: f.phone.trim(),
          zip: f.zip.trim(),
          address: f.address.trim(),
          livesAtHome,
          homeZip: livesAtHome ? f.zip.trim() : f.homeZip.trim(),
          homeAddress: livesAtHome ? f.address.trim() : f.homeAddress.trim(),
        },
      });
      // 作成成功 → そのままログイン。以降は App のルーティングが学生画面へ
      await signInWithEmailAndPassword(auth, accountEmail, pw1);
      navigate("/", { replace: true });
    } catch (ex) {
      if (ex.code === "invalid-code") {
        setRegError("認証コードが一致しないか、有効期限が切れています。もう一度お試しください。");
        setRegStep(2);
      } else if (ex.code === "already-registered") {
        setAlreadyRegistered(true);
        setRegError("このメールアドレスは登録済みです。ログイン画面よりお進みください。");
      } else {
        setRegError(ex.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPrimary =
    regStep === 1 ? checkInitialPw : regStep === 2 ? checkCode : completeReg;
  const primaryDisabled =
    busy ||
    (regStep === 1 ? !regEmail || !regPw : regStep === 2 ? code.length < 6 : !pw1 || !pw2);

  // 年度チェック中／無効な年度の表示
  if (cohortState !== "ok") {
    const msg =
      cohortState === "loading" ? "登録ページを確認しています…"
      : cohortState === "inactive" ? "この卒年度の登録受付は終了しています。"
      : cohortState === "missing" ? "この登録URLは無効です。採用担当からご案内したURLをご確認ください。"
      : "接続に失敗しました。時間をおいて再度お試しください。";
    return (
      <div className="min-h-screen" style={{ background: PAPER }}>
        <div className="max-w-md mx-auto px-6 pt-24 pb-16 ml-in" style={studentFontStyle}>
          <p style={caps(10, GOLD)}>Account Registration</p>
          <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 22 }}>マイページ登録</h1>
          <p className="text-sm mt-6 leading-relaxed" style={{ color: cohortState === "loading" ? MUTE : "#C0264B" }}>
            {msg}
          </p>
          {cohortState !== "loading" && (
            <Link to="/login" className="inline-block mt-8 text-xs font-bold" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
              ログイン画面へ →
            </Link>
          )}
          <p className="text-xs mt-10 leading-relaxed" style={{ color: MUTE }}>
            ご不明な場合は採用担当（imai.syuto@monoloop.jp）までご連絡ください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PAPER }}>
      <div className="max-w-md mx-auto px-6 pt-12 pb-16 ml-in" style={studentFontStyle}>
        <p style={caps(10, GOLD)}>Account Registration — Step {regStep} / 3</p>
        <h1 className="jp-mincho font-bold mt-2" style={{ fontSize: 23 }}>{stepTitles[regStep - 1]}</h1>
        <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTE }}>
          {regStep === 1 && `${grad}年卒向けの登録ページです。メールアドレスと、採用担当の案内に記載の初期パスワードを入力してください。`}
          {regStep === 2 && `${regEmail} 宛に6桁の認証コードを送信しました。メールをご確認のうえ入力してください。`}
          {regStep === 3 && "ご本人の情報を登録してください。入社書類の送付やご連絡に使用します。"}
        </p>

        <div className="mt-8 space-y-4">
          {regStep === 1 && (
            <>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>メールアドレス</p>
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.com" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>初期パスワード</p>
                <input type="password" value={regPw} onChange={(e) => setRegPw(e.target.value)}
                  placeholder="採用担当からの案内に記載" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
            </>
          )}

          {regStep === 2 && (
            <div>
              <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>認証コード（6桁）</p>
              <input
                inputMode="numeric" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full p-3.5 bg-white text-center font-mono font-bold"
                style={{ ...inp, fontSize: 22, letterSpacing: "0.4em" }}
              />
              {resendMsg && <p className="text-xs mt-2" style={{ color: ROSE }}>{resendMsg}</p>}
              <button type="button" onClick={resend} disabled={busy}
                className="text-xs font-bold mt-3 disabled:opacity-40" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
                コードを再送する
              </button>
            </div>
          )}

          {regStep === 3 && (
            <>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>氏名<span style={{ color: GOLD }}> *</span></p>
                <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="佐藤 美咲" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>フリガナ<span style={{ color: GOLD }}> *</span></p>
                <input value={f.kana} onChange={(e) => setF({ ...f, kana: e.target.value })}
                  placeholder="サトウ ミサキ" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>生年月日<span style={{ color: GOLD }}> *</span></p>
                  <input type="date" value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })}
                    className="w-full p-3 text-sm bg-white" style={inp} />
                </div>
                <div>
                  <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>卒年度</p>
                  <p className="w-full p-3 text-sm bg-white" style={{ ...inp, color: MUTE }}>{grad}年卒</p>
                </div>
              </div>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>大学・学部<span style={{ color: GOLD }}> *</span></p>
                <input value={f.univ} onChange={(e) => setF({ ...f, univ: e.target.value })}
                  placeholder="早稲田大学 商学部" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>電話番号<span style={{ color: GOLD }}> *</span></p>
                <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })}
                  placeholder="090-1234-5678" className="w-full p-3.5 text-sm bg-white" style={inp} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>郵便番号</p>
                  <input value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })}
                    placeholder="330-0854" className="w-full p-3.5 text-sm bg-white" style={inp} />
                </div>
                <div className="col-span-2">
                  <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>現住所（書類送付先）<span style={{ color: GOLD }}> *</span></p>
                  <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })}
                    placeholder="埼玉県さいたま市大宮区〇〇 1-2-3" className="w-full p-3.5 text-sm bg-white" style={inp} />
                </div>
              </div>

              {/* 実家住所 */}
              <div>
                <label className="flex items-center gap-2 text-xs" style={{ color: MUTE }}>
                  <input type="checkbox" checked={livesAtHome}
                    onChange={(e) => setLivesAtHome(e.target.checked)} />
                  現在、実家に住んでいます（実家＝上の現住所）
                </label>
                {!livesAtHome && (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>郵便番号</p>
                      <input value={f.homeZip} onChange={(e) => setF({ ...f, homeZip: e.target.value })}
                        placeholder="330-0854" className="w-full p-3.5 text-sm bg-white" style={inp} />
                    </div>
                    <div className="col-span-2">
                      <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>実家の住所<span style={{ color: GOLD }}> *</span></p>
                      <input value={f.homeAddress} onChange={(e) => setF({ ...f, homeAddress: e.target.value })}
                        placeholder="別の場合はこちらに記入してください" className="w-full p-3.5 text-sm bg-white" style={inp} />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2" style={{ borderTop: `1px solid ${HAIR}` }}>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>メールアドレス</p>
                {!changeEmail ? (
                  <p className="text-sm p-3.5 bg-white" style={{ ...inp, color: MUTE }}>{regEmail}</p>
                ) : (
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="新しいメールアドレス" className="w-full p-3.5 text-sm bg-white" style={inp} />
                )}
                <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: MUTE }}>
                  <input type="checkbox" checked={changeEmail} onChange={(e) => setChangeEmail(e.target.checked)} />
                  登録に使用したものと別のメールアドレスに変更する
                </label>
              </div>

              <div className="pt-2" style={{ borderTop: `1px solid ${HAIR}` }}>
                <p className="mb-1.5" style={caps(9, MUTE, "0.14em")}>新しいパスワード（8文字以上）<span style={{ color: GOLD }}> *</span></p>
                <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)}
                  className="w-full p-3.5 text-sm bg-white" style={inp} />
                <p className="mb-1.5 mt-3" style={caps(9, MUTE, "0.14em")}>新しいパスワード（確認）<span style={{ color: GOLD }}> *</span></p>
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                  className="w-full p-3.5 text-sm bg-white" style={inp} />
                <p className="text-xs mt-1.5" style={{ color: MUTE }}>初期パスワードは登録完了後に無効になります。</p>
              </div>

              <label className="flex items-start gap-2 mt-2 text-xs" style={{ color: MUTE }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>
                  <Link to="/privacy" target="_blank" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
                    プライバシーポリシー
                  </Link>
                  に同意します<span style={{ color: GOLD }}> *</span>
                </span>
              </label>
            </>
          )}

          {regError && <p className="text-xs font-bold" style={{ color: "#C0264B" }}>{regError}</p>}
          {alreadyRegistered && (
            <Link to="/login" className="inline-block text-xs font-bold" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>
              ログイン画面へ進む →
            </Link>
          )}

          <button
            onClick={onPrimary} disabled={primaryDisabled}
            className="w-full py-3.5 text-sm font-bold disabled:opacity-40"
            style={{ background: ROSE, color: IVORY }}
          >
            {busy ? "処理中…" : regStep === 3 ? "登録を完了する" : "次へ進む"}
          </button>
        </div>

        <div className="mt-10 pt-5" style={{ borderTop: `1px solid ${HAIR}` }}>
          <p className="text-xs leading-relaxed" style={{ color: MUTE }}>
            すでにご登録済みの方は{" "}
            <Link to="/login" style={{ color: ROSE, borderBottom: `1px solid ${ROSE}` }}>ログイン</Link>
            {" "}へ。<br />
            登録がうまくいかない場合は、採用担当（imai.syuto@monoloop.jp）までご連絡ください。
          </p>
        </div>
      </div>
    </div>
  );
}
