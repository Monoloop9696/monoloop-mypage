import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { auth } from "../firebase";
import { syncRole } from "../lib/api";

const AuthCtx = createContext(null);

// ---- 無操作での自動ログアウト ----
// 最後の操作から24時間で強制サインアウトする（ログイン状態が残り続けないように）
const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const IDLE_CHECK_MS = 60 * 1000; // 期限チェックの間隔
const ACTIVITY_SAVE_MS = 60 * 1000; // 最終操作時刻の保存は最短1分間隔
const LAST_ACTIVE_KEY = "ml_last_active";
const IDLE_FLAG_KEY = "ml_idle_logout";

const readLastActive = () => {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
};
const writeLastActive = (t) => { try { localStorage.setItem(LAST_ACTIVE_KEY, String(t)); } catch { /* noop */ } };
export const clearLastActive = () => { try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch { /* noop */ } };
// ログイン画面で「自動ログアウトしました」を出すためのフラグ（1回だけ読み取る）
export const takeIdleLogoutFlag = () => {
  try {
    const v = localStorage.getItem(IDLE_FLAG_KEY);
    if (v) localStorage.removeItem(IDLE_FLAG_KEY);
    return !!v;
  } catch { return false; }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const savedAtRef = useRef(0); // 直近に localStorage へ書いた時刻（書き込み間引き用）

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // まず既存のトークンから admin クレームを判定
        let admin = false;
        try {
          const tok = await u.getIdTokenResult();
          admin = tok.claims.admin === true;
        } catch {
          /* noop */
        }
        // 管理者メールにクレーム未付与のケースに備え、サーバーと同期
        try {
          const r = await syncRole();
          if (r.admin !== admin) {
            await u.getIdToken(true); // クレーム反映のためトークン更新
            admin = r.admin === true;
          } else {
            admin = r.admin === true;
          }
        } catch {
          // serverless 未デプロイ時などはトークンのクレームを優先
        }
        setIsAdmin(admin);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // 無操作時間の監視。ログイン中だけ動かす
  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    const last = readLastActive();
    // 前回の操作から24時間以上経っていれば、この時点でサインアウト
    if (last && now - last > IDLE_LIMIT_MS) {
      try { localStorage.setItem(IDLE_FLAG_KEY, "1"); } catch { /* noop */ }
      clearLastActive();
      fbSignOut(auth);
      return;
    }
    writeLastActive(now);
    savedAtRef.current = now;

    const touch = () => {
      const t = Date.now();
      if (t - savedAtRef.current < ACTIVITY_SAVE_MS) return; // 書き込みは1分に1回まで
      savedAtRef.current = t;
      writeLastActive(t);
    };
    const onVisible = () => { if (document.visibilityState === "visible") touch(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "focus"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      const l = readLastActive();
      if (l && Date.now() - l > IDLE_LIMIT_MS) {
        try { localStorage.setItem(IDLE_FLAG_KEY, "1"); } catch { /* noop */ }
        clearLastActive();
        fbSignOut(auth);
      }
    }, IDLE_CHECK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [user]);

  const signOut = () => { clearLastActive(); return fbSignOut(auth); };

  return (
    <AuthCtx.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
