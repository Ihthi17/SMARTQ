import { useContext, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AuthContext } from './context/AuthContext';

// ── Auth pages ────────────────────────────────────────────────────
import Login           from './pages/Login';
import ForgotPassword  from './pages/ForgotPassword';
import ChangePassword  from './pages/ChangePassword';
import ResetPassword   from './pages/ResetPassword';

// ── Public pages ──────────────────────────────────────────────────
import PublicQrPage   from './pages/PublicQrPage';

// ── Admin pages ───────────────────────────────────────────────────
import AdminDashboard  from './pages/admin/AdminDashboard';
import SettingsPage    from './pages/admin/SettingsPage';
import ProfilePage     from './pages/admin/ProfilePage';
import UserManagement from './pages/admin/UserManagement';
import RoleManagement from './pages/admin/RoleManagement';
import AppointmentManagement from './pages/admin/AppointmentManagement';
import ProviderManagement from './pages/admin/ProviderManagement';
import LocationManagement from './pages/admin/LocationManagement';
import QueueAnalytics from './pages/admin/QueueAnalytics';
import QueueControl from './pages/staff/QueueControl';
import Home from './pages/customer/Home';
import BookAppointment from './pages/customer/BookAppointment';
import QueueStatus from './pages/customer/QueueStatus';
import QueueDisplayPage from './pages/QueueDisplayPage';
import api from './api/axiosInstance';
import MaintenanceBanner from './components/MaintenanceBanner';

// ── Shared ────────────────────────────────────────────────────────
import ProtectedRoute from './routes/ProtectedRoute';

const ADMIN_ROLES = ['SUPER_ADMIN', 'admin'];
const STAFF_ROLES = [...ADMIN_ROLES, 'staff'];

const AdminRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const PermissionRoute = ({ children, permission, allowedRoles = STAFF_ROLES }) => {
  const { user, permissions } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  const isCustomRole = user.role.startsWith('custom_');
  if ((!allowedRoles.includes(user.role) && !isCustomRole) || (permission && user.role !== 'SUPER_ADMIN' && !permissions.includes(permission))) return <Navigate to="/" replace />;
  return children;
};

const RoleHome = () => {
  const { user, permissions } = useContext(AuthContext);
  if (!user) return <Home />;
  if (ADMIN_ROLES.includes(user.role)) return <Navigate to="/admin" replace />;
  if (user.role === 'staff') {
    if (permissions.includes('queue.view')) return <Navigate to="/admin/queue" replace />;
    if (permissions.includes('appointments.view')) return <Navigate to="/admin/appointments" replace />;
    return <Navigate to="/admin/profile" replace />;
  }
  if (user.role.startsWith('custom_')) {
    if (permissions.includes('queue.view')) return <Navigate to="/admin/queue" replace />;
    if (permissions.includes('appointments.view')) return <Navigate to="/admin/appointments" replace />;
    if (permissions.includes('users.view')) return <Navigate to="/admin/users" replace />;
    if (permissions.includes('providers.view')) return <Navigate to="/admin/providers" replace />;
    if (permissions.includes('settings.view')) return <Navigate to="/admin/settings" replace />;
    return <Navigate to="/admin/profile" replace />;
  }
  return <Navigate to="/login" replace />;
};

const App = () => {
  const { loading } = useContext(AuthContext);

  useEffect(() => {
    let active = true;
    const updateBranding = () => {
      api.get('/settings/branding', { params: { includeLogo: false } }).then(({ data }) => {
        if (!active) return;
        document.title = data.appName || 'Smart Queue';
        let favicon = document.querySelector('link[data-smartqueue-favicon]');
        if (data.favicon) {
          favicon ||= document.createElement('link');
          favicon.rel = 'icon';
          favicon.href = data.favicon;
          favicon.dataset.smartqueueFavicon = 'true';
          document.head.appendChild(favicon);
        } else {
          favicon?.remove();
        }
      }).catch(error => {
        if (active) console.error('Could not load application branding:', error);
      });
    };
    updateBranding();
    window.addEventListener('smartqueue:branding-updated', updateBranding);
    return () => {
      active = false;
      window.removeEventListener('smartqueue:branding-updated', updateBranding);
    };
  }, []);

  // Show loading screen while restoring session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-teal-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MaintenanceBanner />
      <Routes>
      {/* ── Public ─────────────────────────────── */}
      <Route path="/login"          element={<Login />} />
      <Route path="/forgot-password"element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/book-appointment" element={<BookAppointment />} />
      <Route path="/queue-status/:appointmentId" element={<QueueStatus />} />
      <Route path="/queue-display" element={<QueueDisplayPage />} />
      <Route path="/qr/:id/:token" element={<PublicQrPage />} />

      {/* ── Must-change-password (authenticated) ─ */}
      <Route path="/change-password"
        element={<ProtectedRoute allowMustChange><ChangePassword /></ProtectedRoute>} />

      {/* ── Admin ──────────────────────────────── */}
      <Route path="/admin"
        element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/settings"
        element={<PermissionRoute permission="settings.view"><SettingsPage /></PermissionRoute>} />
      <Route path="/admin/profile"
        element={<PermissionRoute allowedRoles={STAFF_ROLES}><ProfilePage /></PermissionRoute>} />
      <Route path="/admin/users"
        element={<PermissionRoute permission="users.view"><UserManagement /></PermissionRoute>} />
      <Route path="/admin/roles"
        element={<PermissionRoute allowedRoles={['SUPER_ADMIN']}><RoleManagement /></PermissionRoute>} />
      <Route path="/admin/providers"
        element={<PermissionRoute permission="providers.view"><ProviderManagement /></PermissionRoute>} />
      <Route path="/admin/locations"
        element={<PermissionRoute permission="providers.view"><LocationManagement /></PermissionRoute>} />
      <Route path="/admin/appointments"
        element={<PermissionRoute permission="appointments.view"><AppointmentManagement /></PermissionRoute>} />
      <Route path="/admin/analytics"
        element={<PermissionRoute permission="appointments.view"><QueueAnalytics /></PermissionRoute>} />
      <Route path="/admin/queue"
        element={<PermissionRoute permission="queue.view"><QueueControl /></PermissionRoute>} />

      {/* ── Root redirect ──────────────────────── */}
      <Route path="/"  element={<RoleHome />} />
      <Route path="*"  element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

export default App;
