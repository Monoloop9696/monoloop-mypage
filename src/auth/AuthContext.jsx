import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { auth } from "../firebase";
import { syncRole } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const signOut = () => fbSignOut(auth);

  return (
    <AuthCtx.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
