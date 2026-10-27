import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { publicCohorts, specialVerify, specialEntry, specialSlots } from "../lib/api";
import { SPECIAL_ROUTES, normalizeSpecialCode, isValidSpecialCode, slotKindForRoute, formatSlotLabel, isSlotFull, SLOT_KINDS, allowedSlotIds, todayJst } from "../lib/specialRoute";
import { PAPER, PINK, ROSE, ROSE_DEEP, IVORY, GOLD, HAIR, MUTE, INK, studentFontStyle, caps } from "../theme";

// =====================================================================
// 特別選考ルート LP（公開・ログイン不要）  /special?code=XXXX
//   スカウトメッセージで配布した特別コードを持つ学生が、ルートを選んでエントリーする。
//   流れ：最初の画面でお名前＋特別コードを確認 → 名前入りのLPを読む → ルートを選ぶ → 詳細を入力 → 完了
//   確認済みのお名前・コードは sessionStorage に残し、同じタブで再読み込みしても入口に戻らないようにする（コードは再確認する）。
//   保存は公開API（/api/public-cohorts の action=specialVerify / specialEntry）経由。Firestore は直接触らない。
// =====================================================================

const VERIFY_MSG = {
  not_found: "このコードは見つかりませんでした。スカウトメッセージに記載のコードをご確認ください。",
  expired: "このコードは有効期限が過ぎています。スカウトを受け取った媒体のメッセージから採用担当へご連絡ください。",
  stopped: "このコードは現在受付を停止しています。",
};

const PERKS = [
  { k: "書類選考なし", title: "エントリーシートは不要です", body: "プロフィールはすでに拝見しています。書類を書く時間は、面接で話したいことを考える時間に使ってください。" },
  { k: "会社を知ってから", title: "説明会・オープンカンパニーから始まります", body: "いきなり面接ではなく、会社の雰囲気や仕事を知る場から始めて、そのまま選考に進めます。" },
  { k: "ルートを選べる", title: "選考か、まず話すか", body: "すぐ選考に進むことも、社員と話してから決めることもできます。途中で別のルートに切り替えることもできます。" },
];

const FAQ = [
  ["選ぶルートによって合否に差は出ますか？", "出ません。どのルートでも評価の基準は同じです。今の気持ちに一番近いものを選んでください。"],
  ["特別選考ルート①と②の違いは何ですか？", "最初のステップが違います。①は会社説明会、②はオープンカンパニーから始まります。どちらも書類選考は免除で、①は一次・二次・最終の3回、②は一次・最終の2回の面接です。"],
  ["カジュアル面談のあとに、選考へ進めますか？", "進めます。終わったあとに希望を伺い、そのまま特別選考ルート①または②の日程を調整します。"],
  ["コードの有効期限が切れてしまいました。", "スカウトを受け取った媒体のメッセージから、採用担当へご連絡ください。"],
  ["カジュアル面談での服装や持ち物の指定はありますか？", "オンラインで実施するため服装は自由です。履歴書などの書類も必要ありません。"],
];

export default function SpecialEntry() {
  const [params] = useSearchParams();
  const initialCode = normalizeSpecialCode(params.get("code") || "");

  const [route, setRoute] = useState(null); // 選んだルート（SPECIAL_ROUTES の要素）
  const [opened, setOpened] = useState(false); // 入口（お名前＋コード）を通過したか
  const [restoring, setRestoring] = useState(true); // 再読み込み時の自動確認中
  const [step, setStep] = useState(2); // 2=詳細入力 / 3=完了
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [verified, setVerified] = useState(""); // 確認済みのコード
  const [f, setF] = useState({ kana: "", univ: "", faculty: "", grad: "", email: "", phone: "", question: "" });
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState(""); // ボット対策（画面には出さない）
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [years, setYears] = useState([]);
  // 説明会／OCの候補日程（ルート①②のみ）。複数に印を付ける＋「別日で調整を希望」
  const [slotList, setSlotList] = useState([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [pickedSlots, setPickedSlots] = useState(() => new Set());
  const [otherDate, setOtherDate] = useState(false);
  const [saved, setSaved] = useState(null); // 送信後にサーバーが受け付けた内容 { slotIds, otherDate }（完了画面用）
  const slotReq = useRef(0); // 候補取得の連番（素早くルートを切り替えたとき古い応答で上書きしない）
  const slotKind = route ? slotKindForRoute(route.id) : null;

  // 候補日程を取り直す。prune=true のときは、選択中の印を今選べる枠だけに絞る（満員・停止になった枠を外す）
  const loadSlots = (kind, { prune = false } = {}) => {
    const seq = ++slotReq.current;
    setSlotLoading(true);
    return specialSlots(kind)
      .then(({ slots }) => {
        if (seq !== slotReq.current) return;
        const list = slots || [];
        setSlotList(list);
        if (prune) {
          const ok = allowedSlotIds(list, { kind, today: todayJst() });
          setPickedSlots((prev) => new Set([...prev].filter((id) => ok.has(id))));
        }
      })
      .catch(() => { if (seq === slotReq.current) setSlotList([]); })
      .finally(() => { if (seq === slotReq.current) setSlotLoading(false); });
  };

  const entryRef = useRef(null);
  const firstInputRef = useRef(null);

  // 卒業予定年度の選択肢は、受付中の卒年度から作る（取得できなくても入力は続けられる）
  useEffect(() => {
    let alive = true;
    publicCohorts()
      .then(({ cohorts }) => {
        if (!alive) return;
        const ys = (cohorts || []).filter((c) => c.active).map((c) => c.year).sort((a, b) => b - a);
        setYears(ys);
        if (ys.length) setF((p) => (p.grad ? p : { ...p, grad: String(ys[0]) }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const base = years.length ? years : [now + 2, now + 1, now + 3];
    return [...new Set(base)];
  }, [years]);

  // 同じタブで確認済みなら、入口を飛ばしてLPを開く（コードの状態は毎回サーバーで再確認）
  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("ml_special_gate") || "null"); } catch { /* noop */ }
    if (!saved || !saved.name || !saved.code || (initialCode && saved.code !== initialCode)) { setRestoring(false); return; }
    specialVerify(saved.code)
      .then((r) => { if (r.ok) { setName(saved.name); setCode(r.code); setVerified(r.code); setOpened(true); } })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToRoutes = () => document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const pickRoute = (r) => {
    setRoute(r);
    setErr("");
    if (step === 3) setStep(2);
    // ルートに応じた候補日程を取り直す（選択はリセット）
    setPickedSlots(new Set());
    setOtherDate(false);
    setSaved(null);
    const kind = slotKindForRoute(r.id);
    if (kind) {
      loadSlots(kind);
    } else {
      slotReq.current += 1; // 進行中の取得があっても反映させない
      setSlotList([]);
      setSlotLoading(false);
    }
    setTimeout(() => {
      entryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 400);
    }, 50);
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr("");
    const c = normalizeSpecialCode(code);
    if (!name.trim()) return setErr("お名前を入力してください。");
    if (!c) return setErr("特別コードを入力してください。");
    if (!isValidSpecialCode(c)) return setErr(VERIFY_MSG.not_found);
    setBusy(true);
    try {
      const r = await specialVerify(c);
      if (!r.ok) return setErr(VERIFY_MSG[r.reason] || VERIFY_MSG.not_found);
      setVerified(r.code);
      setCode(r.code);
      setName(name.trim());
      setOpened(true);
      try { sessionStorage.setItem("ml_special_gate", JSON.stringify({ name: name.trim(), code: r.code })); } catch { /* noop */ }
      window.scrollTo(0, 0);
    } catch (ex) {
      setErr(ex.message || "コードを確認できませんでした。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!route) return setErr("選考ルートを選んでください。");
    if (slotKind && slotList.length > 0 && pickedSlots.size === 0 && !otherDate) return setErr("候補日程を選ぶか、別日での調整を希望してください。");
    if (!f.kana.trim()) return setErr("フリガナを入力してください。");
    if (!/^[ァ-ヶー\s　]+$/.test(f.kana.trim())) return setErr("フリガナは全角カタカナで入力してください。");
    if (!f.univ.trim()) return setErr("大学名を入力してください。");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setErr("メールアドレスの形式を確認してください。");
    if (f.phone.trim() && !/^\d{2,4}-\d{2,4}-\d{3,4}$/.test(f.phone.trim())) return setErr("電話番号はハイフンつきで入力してください（例：090-1234-5678）。");
    if (!agree) return setErr("個人情報の取り扱いへの同意が必要です。");
    setBusy(true);
    try {
      const r = await specialEntry({
        code: verified, route: route.id, name: name.trim(),
        kana: f.kana.trim(), univ: f.univ.trim(), faculty: f.faculty.trim(),
        grad: f.grad ? Number(f.grad) : null, email: f.email.trim(), phone: f.phone.trim(),
        question: f.question.trim(), agree: true, website,
        slotIds: slotKind ? [...pickedSlots] : [], otherDate: slotKind ? otherDate : false,
      });
      // 完了画面はサーバーが実際に受け付けた候補（満員・停止で除外されたものは含まない）を表示する
      setSaved({ slotIds: Array.isArray(r.slotIds) ? r.slotIds : [], otherDate: r.otherDate === true });
      setStep(3);
      setTimeout(() => entryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (ex) {
      if (ex.code === "not_found" || ex.code === "expired" || ex.code === "stopped") {
        setErr(ex.message || "送信できませんでした。時間をおいて再度お試しください。");
        backToGate();
      } else if (slotKind && /候補日程/.test(ex.message || "")) {
        // 送信中に枠が満員・停止になった（または画面を開いたあとに枠が追加された）。候補を取り直して選び直してもらう
        setErr("選んだ日程が満員または受付終了になりました。候補を選び直すか、別日での調整を希望してください。");
        loadSlots(slotKind, { prune: true });
      } else {
        setErr(ex.message || "送信できませんでした。時間をおいて再度お試しください。");
      }
    } finally {
      setBusy(false);
    }
  };

  // 入口に戻る（お名前・コードの修正）
  const backToGate = () => {
    setOpened(false); setVerified(""); setStep(2); setRoute(null);
    try { sessionStorage.removeItem("ml_special_gate"); } catch { /* noop */ }
    window.scrollTo(0, 0);
  };

  const inp = "w-full rounded-lg px-3 py-3 text-base bg-white min-w-0";
  const inpStyle = { border: `1px solid ${HAIR}`, color: INK };
  const label = "block text-sm font-bold mb-1.5";
  const req = <span className="ml-1.5 text-xs font-normal" style={{ color: ROSE }}>必須</span>;

  if (restoring) {
    return <div className="min-h-screen" style={{ background: PAPER }} />;
  }

  // ---- 入口：お名前と特別コード ----
  if (!opened) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(160deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, ...studentFontStyle }}>
        <header className="px-5 py-3.5 flex items-center gap-2.5" style={{ background: "#fff" }}>
          <img src="/logo.png" alt="モノ・ループ" style={{ height: 22, width: "auto" }} />
          <span className="text-xs font-bold" style={{ color: MUTE }}>モノ・ループ株式会社</span>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-10">
          <div className="w-full ml-in" style={{ maxWidth: 400 }}>
            <img src="/loopchan/loopchan-4.png" alt="" aria-hidden="true" className="mx-auto mb-3 ml-float" style={{ width: 72 }} />
            <p className="text-center" style={caps(10, PINK)}>Special Invitation</p>
            <h1 className="text-center font-bold mt-2" style={{ color: IVORY, fontSize: "clamp(22px, 6vw, 28px)", lineHeight: 1.45 }}>
              特別選考ルートへの<br />招待状が届いています
            </h1>
            <form onSubmit={verify} noValidate className="relative mt-7 rounded-2xl px-5 pt-6 pb-6 space-y-4"
              style={{ background: IVORY, color: INK, boxShadow: "0 18px 40px rgba(80,0,40,.28)" }}>
              <p className="text-sm leading-relaxed" style={{ color: MUTE }}>
                スカウトメッセージに記載の特別コードと、お名前を入力してください。
              </p>
              <div>
                <label htmlFor="sp-name" className={label}>お名前{req}</label>
                <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)}
                  autoComplete="name" placeholder="山田 花子" className={inp} style={inpStyle} />
              </div>
              <div>
                <label htmlFor="sp-code" className={label}>特別コード{req}</label>
                <input id="sp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX" maxLength={20}
                  className={`${inp} text-center font-bold`}
                  style={{ ...inpStyle, fontSize: 20, letterSpacing: "0.16em", fontFamily: "ui-monospace, Menlo, monospace" }} />
              </div>
              {err && <p role="alert" className="text-sm" style={{ color: "#B91C1C" }}>{err}</p>}
              <button type="submit" disabled={busy} className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-50"
                style={{ background: ROSE, color: IVORY }}>
                {busy ? "確認しています…" : "招待状を開く"}
              </button>
            </form>
            <p className="text-center text-xs mt-6" style={{ color: PINK }}>
              コードがわからない場合は、スカウトを受け取った媒体のメッセージをご確認ください。
            </p>
          </div>
        </main>
      </div>
    );
  }

  const you = `${name}さん`;

  return (
    <div className="min-h-screen" style={{ background: PAPER, ...studentFontStyle }}>
      {/* ヘッダー */}
      <header className="px-5 py-3.5 flex items-center gap-2.5" style={{ background: "#fff", borderBottom: `1px solid ${HAIR}` }}>
        <img src="/logo.png" alt="モノ・ループ" style={{ height: 22, width: "auto" }} />
        <span className="text-xs font-bold" style={{ color: MUTE }}>モノ・ループ株式会社</span>
      </header>

      {/* ヒーロー */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: IVORY }}>
        <div className="max-w-4xl mx-auto px-6 pt-12 pb-14 md:pt-16 md:pb-20 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div className="ml-in">
            <p style={caps(10, PINK)}>Special Invitation</p>
            <h1 className="font-bold mt-3" style={{ fontSize: "clamp(28px, 7vw, 44px)", lineHeight: 1.35 }}>
              スカウトを受け取った<br />{you}だけの、<br />
              <span style={{ background: IVORY, color: ROSE, padding: "0 .25em", borderRadius: 4 }}>特別な入口</span>です。
            </h1>
            <p className="mt-5 text-sm md:text-base leading-relaxed" style={{ opacity: 0.92 }}>
              お送りした特別コードで、通常とは別の選考ルートを選べます。
              すぐに選考へ進むのも、まずは話を聞いてみるのも、{you}が決めてください。
            </p>
            <button onClick={scrollToRoutes}
              className="mt-7 inline-flex items-center gap-2 font-bold text-sm px-6 py-3.5 rounded-full"
              style={{ background: IVORY, color: ROSE }}>
              選考ルートを見る ↓
            </button>
          </div>
          <div className="relative flex justify-center ml-in ml-in-2">
            {/* 招待券 */}
            <div className="relative w-full rounded-2xl px-5 pt-5 pb-4" style={{ background: IVORY, color: INK, maxWidth: 300, transform: "rotate(-3deg)", boxShadow: "0 18px 40px rgba(80,0,40,.28)" }}>
              <div className="flex items-center justify-between">
                <span style={caps(9, MUTE, "0.2em")}>Invitation</span>
                <span className="text-xs font-bold px-2 rounded" style={{ border: `2px solid ${GOLD}`, color: GOLD }}>招待</span>
              </div>
              <p className="font-bold mt-2" style={{ fontSize: 19 }}>特別選考ルート</p>
              <p className="text-sm mt-0.5" style={{ color: MUTE }}>{you}へのご招待</p>
              <div className="my-3" style={{ borderTop: `2px dashed ${HAIR}` }} />
              <p className="text-center font-bold" style={{ fontSize: 22, letterSpacing: "0.16em", color: ROSE, fontFamily: "ui-monospace, Menlo, monospace" }}>
                {verified}
              </p>
              <p className="text-center mt-1" style={{ fontSize: 11, color: MUTE }}>{you}専用の特別コード</p>
              <img src="/loopchan/loopchan-4.png" alt="" aria-hidden="true" className="absolute ml-float" style={{ width: 92, right: -34, bottom: -40 }} />
            </div>
          </div>
        </div>
      </section>

      {/* なぜ届いたか */}
      <section className="max-w-4xl mx-auto px-6 pt-14 md:pt-20 grid md:grid-cols-[1fr_1.5fr] gap-6 md:gap-12">
        <div>
          <p style={caps(10, GOLD)}>Why you</p>
          <h2 className="font-bold mt-2" style={{ fontSize: "clamp(22px, 5vw, 28px)", lineHeight: 1.45 }}>なぜ、{you}に<br />届いたのか。</h2>
        </div>
        <div className="space-y-4 text-sm md:text-base leading-relaxed" style={{ color: "#4A3A40" }}>
          <p>スカウトは一斉には送っていません。プロフィールに書かれた経験や、言葉の選び方を一人ずつ読んで、「この人と話してみたい」と思った方にだけお送りしています。</p>
          <p>だからこそ、通常の応募と同じ手順を踏んでもらう必要はないと考えました。このページでは、{you}に合った進み方を選べるようにしています。</p>
          <p className="text-sm font-bold" style={{ color: MUTE }}>― モノ・ループ 採用担当より</p>
        </div>
      </section>

      {/* 特典 */}
      <section className="max-w-4xl mx-auto px-6 pt-14 md:pt-20">
        <p style={caps(10, GOLD)}>Benefits</p>
        <h2 className="font-bold mt-2" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>特別コードでできること</h2>
        <div className="grid md:grid-cols-3 gap-3 mt-6">
          {PERKS.map((p) => (
            <div key={p.k} className="rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${HAIR}` }}>
              <p className="font-bold" style={{ fontSize: 24, color: ROSE, lineHeight: 1.3 }}>{p.k}</p>
              <p className="font-bold text-sm mt-2">{p.title}</p>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: MUTE }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ルート選択 */}
      <section id="routes" className="max-w-4xl mx-auto px-6 pt-14 md:pt-20" style={{ scrollMarginTop: 16 }}>
        <p style={caps(10, GOLD)}>Choose your route</p>
        <h2 className="font-bold mt-2" style={{ fontSize: "clamp(22px, 5vw, 28px)", lineHeight: 1.45 }}>{you}に合う選考ルートを<br className="md:hidden" />選んでください</h2>
        <p className="text-sm mt-2" style={{ color: MUTE }}>どのルートを選んでも、選考上の有利・不利はありません。</p>
        <div className="grid md:grid-cols-3 gap-3 mt-6 items-stretch">
          {SPECIAL_ROUTES.map((r) => {
            const on = route?.id === r.id;
            return (
              <button key={r.id} type="button" onClick={() => pickRoute(r)} aria-pressed={on}
                className="text-left rounded-2xl p-5 flex flex-col gap-3 transition-colors"
                style={{ background: "#fff", border: `2px solid ${on ? ROSE : HAIR}`, boxShadow: on ? `0 0 0 4px ${PINK}` : "none" }}>
                <span className="self-start text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={r.recommended ? { background: ROSE, color: IVORY } : { background: "#FCE3EF", color: ROSE }}>
                  {r.tag}
                </span>
                <span className="font-bold" style={{ fontSize: 20, lineHeight: 1.4 }}>{r.name}</span>
                <span className="text-sm" style={{ color: MUTE }}>{r.who}</span>
                <span className="block ml-1.5 pl-4 space-y-1.5" style={{ borderLeft: `2px solid ${HAIR}` }}>
                  {r.steps.map((s) => (
                    <span key={s.label} className="relative block text-sm" style={s.skip ? { color: MUTE, textDecoration: "line-through" } : {}}>
                      <span className="absolute rounded-full" style={{ left: -23, top: 6, width: 10, height: 10, background: "#fff", border: `2px solid ${s.skip ? HAIR : ROSE}` }} />
                      {s.label}{s.skip && "（免除）"}
                    </span>
                  ))}
                </span>
                <span className="mt-auto pt-3 flex justify-between gap-2 text-xs" style={{ borderTop: `1px solid ${HAIR}`, color: MUTE }}>
                  <span>{r.time}</span><b style={{ color: INK }}>{r.pace}</b>
                </span>
                <span className="text-sm font-bold" style={{ color: ROSE }}>{on ? "✓ 選択中" : "このルートを選ぶ"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* エントリー */}
      <section ref={entryRef} className="max-w-xl mx-auto px-6 pt-10" style={{ scrollMarginTop: 16 }}>
        {!route ? (
          <p className="text-sm text-center rounded-2xl px-4 py-6" style={{ color: MUTE, border: `1px dashed ${MUTE}` }}>
            上のルートから1つ選ぶと、ここにエントリーフォームが表示されます。
          </p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${HAIR}` }}>
            <div className="px-5 py-4" style={{ background: "#FCE3EF" }}>
              <p className="text-xs" style={{ color: MUTE }}>選択中のルート</p>
              <p className="font-bold" style={{ fontSize: 18 }}>{route.name}</p>
            </div>
            <div className="px-5 pt-4 pb-6">
              <ol className="flex flex-wrap gap-x-2 text-xs mb-4" style={{ color: MUTE }} aria-label="進行状況">
                {["エントリー情報", "完了"].map((t, i) => (
                  <li key={t} aria-current={step === i + 2 ? "step" : undefined}
                    style={step === i + 2 ? { color: ROSE, fontWeight: 700 } : {}}>
                    {i + 1} {t}{i < 1 && <span className="ml-2" style={{ color: HAIR }}>›</span>}
                  </li>
                ))}
              </ol>

              {step === 2 && (
                <form onSubmit={submit} noValidate className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: PAPER }}>
                    <span className="text-xs font-bold px-2 rounded" style={{ border: `2px solid ${GOLD}`, color: GOLD }}>確認済</span>
                    <span>{name} 様　コード <b style={{ letterSpacing: "0.1em" }}>{verified}</b></span>
                  </div>
                  {slotKind && (
                    <div>
                      <p className={label}>{SLOT_KINDS[slotKind]}の候補日程{slotList.length > 0 && req}</p>
                      {slotLoading ? (
                        <p className="text-sm" style={{ color: MUTE }}>日程を読み込んでいます…</p>
                      ) : slotList.length === 0 ? (
                        <p className="text-sm rounded-lg px-3 py-2.5" style={{ background: PAPER, color: MUTE }}>日程は人事からご連絡します。</p>
                      ) : (
                        <>
                          <p className="text-xs mb-2" style={{ color: MUTE }}>都合のよい日程にすべて印を付けてください。</p>
                          <div className="space-y-1.5">
                            {slotList.map((s) => {
                              const full = isSlotFull(s);
                              const on = pickedSlots.has(s.id);
                              return (
                                <label key={s.id} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                                  style={{ border: `1px solid ${on ? ROSE : HAIR}`, background: full ? "#F7F7F7" : on ? "#FCE3EF" : "#fff", opacity: full ? 0.6 : 1, cursor: full ? "not-allowed" : "pointer" }}>
                                  <input type="checkbox" checked={on} disabled={full} className="mt-1" style={{ accentColor: ROSE }}
                                    onChange={(e) => setPickedSlots((prev) => { const n = new Set(prev); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold">{formatSlotLabel(s)}</span>
                                    {s.note && <span className="block text-xs" style={{ color: MUTE }}>{s.note}</span>}
                                  </span>
                                  {full ? (
                                    <span className="shrink-0 text-xs font-bold" style={{ color: "#B91C1C" }}>満員</span>
                                  ) : s.remaining != null ? (
                                    <span className="shrink-0 text-xs font-bold" style={{ color: ROSE }}>残り{s.remaining}名</span>
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                          <label className="flex items-start gap-2.5 mt-2 text-sm">
                            <input type="checkbox" checked={otherDate} onChange={(e) => setOtherDate(e.target.checked)} className="mt-1" style={{ accentColor: ROSE }} />
                            <span>候補の中に参加できる日がない（別日で調整を希望）</span>
                          </label>
                          {otherDate && <p className="text-xs mt-1 ml-6" style={{ color: MUTE }}>人事から別途ご連絡します。</p>}
                        </>
                      )}
                    </div>
                  )}
                  <div>
                    <label htmlFor="sp-kana" className={label}>フリガナ{req}</label>
                    <input id="sp-kana" ref={firstInputRef} value={f.kana} onChange={(e) => setF({ ...f, kana: e.target.value })}
                      placeholder="ヤマダ ハナコ" className={inp} style={inpStyle} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label htmlFor="sp-univ" className={label}>大学名{req}</label>
                      <input id="sp-univ" value={f.univ} onChange={(e) => setF({ ...f, univ: e.target.value })}
                        placeholder="〇〇大学" className={inp} style={inpStyle} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="sp-fac" className={label}>学部・学科</label>
                      <input id="sp-fac" value={f.faculty} onChange={(e) => setF({ ...f, faculty: e.target.value })}
                        placeholder="経済学部 経営学科" className={inp} style={inpStyle} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label htmlFor="sp-grad" className={label}>卒業予定年度{req}</label>
                      <select id="sp-grad" value={f.grad} onChange={(e) => setF({ ...f, grad: e.target.value })}
                        className={inp} style={inpStyle}>
                        {yearOptions.map((y) => <option key={y} value={y}>{y}年3月卒業予定（{String(y).slice(2)}卒）</option>)}
                        <option value="">その他</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="sp-tel" className={label}>電話番号</label>
                      <input id="sp-tel" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })}
                        autoComplete="tel" placeholder="090-1234-5678" className={inp} style={inpStyle} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sp-mail" className={label}>メールアドレス{req}</label>
                    <input id="sp-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
                      autoComplete="email" placeholder="hanako@example.ac.jp" className={inp} style={inpStyle} />
                    <p className="text-xs mt-1.5" style={{ color: MUTE }}>ここに今後のご案内をお送りします。</p>
                  </div>
                  <div>
                    <label htmlFor="sp-q" className={label}>面談で聞いてみたいこと（任意）</label>
                    <textarea id="sp-q" rows={3} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })}
                      placeholder="例：入社1年目の仕事内容" className={inp} style={inpStyle} />
                  </div>
                  {/* ボット対策：人には見えない入力欄 */}
                  <div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
                    <label>ウェブサイト<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" style={{ accentColor: ROSE }} />
                    <span>
                      入力した情報を採用選考および選考に関するご連絡のために利用することに同意します（
                      <Link to="/privacy" target="_blank" className="underline" style={{ color: ROSE }}>プライバシーポリシー</Link>）。
                    </span>
                  </label>
                  {err && <p role="alert" className="text-sm" style={{ color: "#B91C1C" }}>{err}</p>}
                  <button type="submit" disabled={busy} className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-50"
                    style={{ background: ROSE, color: IVORY }}>
                    {busy ? "送信しています…" : `${route.name}でエントリーする`}
                  </button>
                  <button type="button" onClick={backToGate} className="w-full text-xs font-bold py-1" style={{ color: MUTE }}>
                    ← お名前・コードを修正する
                  </button>
                </form>
              )}

              {step === 3 && (
                <div className="text-center py-2">
                  <img src="/loopchan/loopchan-8.png" alt="" aria-hidden="true" className="mx-auto ml-float" style={{ width: 110 }} />
                  <p className="font-bold mt-3" style={{ fontSize: 20 }}>エントリーを受け付けました</p>
                  {slotKind && saved && (saved.slotIds.length > 0 || saved.otherDate) && (
                    <div className="text-left rounded-lg px-4 py-3 mt-3 text-sm" style={{ background: PAPER }}>
                      <p className="text-xs font-bold mb-1" style={{ color: MUTE }}>ご希望の候補日程</p>
                      <ul className="space-y-0.5">
                        {slotList.filter((s) => saved.slotIds.includes(s.id)).map((s) => <li key={s.id}>・{formatSlotLabel(s)}</li>)}
                        {saved.otherDate && <li>・別日での調整を希望</li>}
                      </ul>
                      <p className="text-xs mt-1.5" style={{ color: MUTE }}>日程は人事からご連絡します。</p>
                    </div>
                  )}
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: MUTE }}>
                    {route.next}<br />確認のメールを {f.email} にお送りしました。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-6 pt-14 md:pt-20">
        <p style={caps(10, GOLD)}>FAQ</p>
        <h2 className="font-bold mt-2" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>よくある質問</h2>
        <div className="space-y-2 mt-5">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-xl px-4 py-3.5" style={{ background: "#fff", border: `1px solid ${HAIR}` }}>
              <summary className="font-bold text-sm cursor-pointer">{q}</summary>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: MUTE }}>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 締め */}
      <section className="max-w-2xl mx-auto px-6 pt-14 pb-16 text-center">
        <img src="/loopchan/loopchan-5.png" alt="" aria-hidden="true" className="mx-auto" style={{ width: 96 }} />
        <p className="font-bold mt-3 leading-relaxed" style={{ fontSize: "clamp(17px, 4vw, 20px)" }}>
          ここまで読んでくださって、ありがとうございます。<br />{you}と話せる日を楽しみにしています。
        </p>
        {step !== 3 && (
          <button onClick={scrollToRoutes} className="mt-6 inline-flex font-bold text-sm px-6 py-3.5 rounded-full" style={{ background: ROSE, color: IVORY }}>
            ルートを選んでエントリーする
          </button>
        )}
        <p className="text-xs mt-10" style={{ color: MUTE }}>
          モノ・ループ株式会社 新卒採用　｜　<Link to="/privacy" className="underline">プライバシーポリシー</Link>
        </p>
      </section>
    </div>
  );
}
