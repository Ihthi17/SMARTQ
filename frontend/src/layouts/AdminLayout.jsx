import { useState, useContext, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Settings, LogOut, Menu, X, ChevronDown, ShieldCheck, PanelLeftClose, PanelLeftOpen,
  ChevronRight, UserCircle, CalendarDays, ListOrdered, BriefcaseBusiness, MonitorPlay, MapPin,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'admin'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'users.view' },
  { to: '/admin/roles', label: 'Role management', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'appointments.view' },
  { to: '/admin/analytics', label: 'Analytics', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'appointments.view' },
  { to: '/admin/queue', label: 'Queue control', icon: ListOrdered, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'queue.view' },
  { to: '/queue-display', label: 'Live queue display', icon: MonitorPlay, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'queue.view' },
  { to: '/admin/providers', label: 'Service management', icon: BriefcaseBusiness, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'providers.view' },
  { to: '/admin/locations', label: 'Locations', icon: MapPin, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'providers.view' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN', 'admin', 'staff'], permission: 'settings.view' },
];

export const AdminLayout = ({ children }) => {
  const { user, logout, permissions } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [branding, setBranding] = useState({ appName: 'Smart Queue', logo: '' });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const loadBranding = () => {
      api.get('/settings/branding').then(({ data }) => {
        if (!active) return;
        setBranding({
          appName: data.appName || 'Smart Queue',
          logo: data.logo || '',
        });
      }).catch(error => {
        if (active) toast.error(error.response?.data?.message || 'Could not load application branding');
      });
    };
    loadBranding();
    window.addEventListener('smartqueue:branding-updated', loadBranding);
    return () => {
      active = false;
      window.removeEventListener('smartqueue:branding-updated', loadBranding);
    };
  }, [user?.role]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Signed out locally; server session cleanup failed');
    }
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white shadow-lg transition-[width,transform] duration-200
          w-64 ${collapsed ? 'md:w-20' : 'md:w-64'}
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Logo */}
        <div className={`flex h-16 items-center justify-between border-b border-slate-200 ${collapsed ? 'px-3 md:justify-center' : 'px-5'}`}>
          <span className={`flex min-w-0 items-center gap-2 font-bold text-lg tracking-tight text-teal-700 ${collapsed ? 'md:hidden' : ''}`}>
            {branding.logo && <img src={branding.logo} alt="" className="h-8 max-w-10 object-contain" />}
            <span className="truncate">{branding.appName}</span>
          </span>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close sidebar"><X size={20} /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.filter(item => (item.roles.includes(user?.role) || user?.role?.startsWith('custom_')) && (!item.permission || user?.role === 'SUPER_ADMIN' || permissions.includes(item.permission))).map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || (to !== '/admin' && location.pathname.startsWith(to + '/'));
            return (
              <Link
                key={to} to={to}
                onClick={() => setOpen(false)}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${collapsed ? 'md:justify-center md:px-0' : ''}
                  ${active ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Icon size={18} />
                <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
                {active && <ChevronRight size={14} className={`ml-auto ${collapsed ? 'md:hidden' : ''}`} />}
              </Link>
            );
          })}
        </nav>

        {/* User strip */}
        <div className={`border-t border-slate-200 p-4 ${collapsed ? 'md:px-2 md:text-center' : ''}`}>
          <div className={`mb-1 truncate text-xs text-slate-500 ${collapsed ? 'md:hidden' : ''}`}>{user?.username}</div>
          <div className={`mb-3 text-xs font-semibold text-teal-700 ${collapsed ? 'md:hidden' : ''}`}>{user?.role}</div>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Sign out' : undefined}
            className={`flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors ${collapsed ? 'md:justify-center' : ''}`}
          >
            <LogOut size={16} /><span className={collapsed ? 'md:hidden' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className={`flex min-h-screen flex-1 flex-col transition-[margin] duration-200 ${collapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {/* Top bar */}
        <header className="h-16 bg-white shadow-sm flex items-center px-4 md:px-6 gap-4">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open sidebar"><Menu size={22} /></button>
          <button
            type="button"
            onClick={() => setCollapsed(value => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:inline-flex"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <span className="font-semibold text-slate-700">Admin Panel</span>
          <div className="relative ml-auto">
            <button
              type="button" onClick={() => setProfileOpen(value => !value)}
              aria-expanded={profileOpen} aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 font-bold text-white">{(user?.username || 'U').slice(0, 1).toUpperCase()}</span>
              <span className="hidden sm:inline">{user?.username || 'Account'}</span>
              <ChevronDown size={15} />
            </button>
            {profileOpen && (
              <div role="menu" className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <Link role="menuitem" to="/admin/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <UserCircle size={16} /> My profile
                </Link>
                <button role="menuitem" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
