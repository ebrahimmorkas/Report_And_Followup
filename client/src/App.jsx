import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import EntriesPage from './pages/EntriesPage';
import ChangePassword from './pages/ChangePassword';
import Users from './pages/admin/Users';
import Activities from './pages/admin/Activities';
import Masters from './pages/admin/Masters';
import AuditLog from './pages/admin/AuditLog';

function RequireAuth({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!loading && user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/report" replace />} />
        <Route path="report" element={<EntriesPage kind="report" key="report" />} />
        <Route path="follow-up" element={<EntriesPage kind="followup" key="followup" />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="admin/users" element={<RequireAuth adminOnly><Users /></RequireAuth>} />
        <Route path="admin/activities" element={<RequireAuth adminOnly><Activities /></RequireAuth>} />
        <Route path="admin/masters" element={<RequireAuth adminOnly><Masters /></RequireAuth>} />
        <Route path="admin/audit" element={<RequireAuth adminOnly><AuditLog /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
