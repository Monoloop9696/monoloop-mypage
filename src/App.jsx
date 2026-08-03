import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { FullLoader } from "./components/common";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import ResetConfirm from "./pages/ResetConfirm";
import Privacy from "./pages/Privacy";
import StudentApp from "./pages/StudentApp";
import AdminApp from "./pages/AdminApp";

// ログイン済みのみ許可。ロールに応じて学生/管理を出し分け
function RequireAuth({ children, admin = false }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  if (!admin && isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

// /signup/:year 動的ルート。年度の有効性は Signup 側が公開APIで確認する。
function SignupRoute() {
  const { year } = useParams();
  if (!/^\d{4}$/.test(year || "")) return <Navigate to="/login" replace />;
  return <Signup year={Number(year)} />;
}

export default function App() {
  const { user, isAdmin, loading } = useAuth();

  return (
    <Routes>
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/signup/:year" element={<SignupRoute />} />
      <Route
        path="/login"
        element={
          loading ? (
            <FullLoader />
          ) : user ? (
            <Navigate to={isAdmin ? "/admin" : "/"} replace />
          ) : (
            <Login />
          )
        }
      />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/reset-confirm" element={<ResetConfirm />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <StudentApp />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth admin>
            <AdminApp />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
