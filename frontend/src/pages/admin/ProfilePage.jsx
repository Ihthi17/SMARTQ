import { useState, useEffect, useContext } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { UserCircle, Save, KeyRound } from 'lucide-react';

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
    {children}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
  />
);

export default function ProfilePage() {
  const { user, setToken } = useContext(AuthContext);
  const [profile, setProfile]   = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [pwForm, setPwForm]     = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    api.get('/users/me')
      .then(r => setProfile({ name: r.data.name || '', email: r.data.email || '', phone: r.data.phone || '' }))
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/users/me', profile);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm)
      return toast.error('New passwords do not match');
    if (pwForm.newPassword.length < 8)
      return toast.error('Password must be at least 8 characters');
    setPwSaving(true);
    try {
      await api.patch('/users/me/password', {
        oldPassword: pwForm.oldPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password updated — please log in again');
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
      // clear access token so the interceptor triggers re-login
      setTimeout(() => { setToken(null); window.location.href = '/login'; }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally { setPwSaving(false); }
  };

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <UserCircle size={26} className="text-teal-600" /> My Profile
        </h1>

        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : (
          <>
            {/* ── Profile form ── */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-slate-700">Account Details</h2>
              <form onSubmit={saveProfile} className="space-y-4">
                <Field label="Full Name">
                  <Input value={profile.name}  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                </Field>
                <Field label="Phone">
                  <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+91 …" />
                </Field>
                <Field label="Username">
                  <Input value={user?.username || ''} disabled />
                </Field>
                <Field label="Role">
                  <Input value={user?.role || ''} disabled />
                </Field>
                <button
                  type="submit" disabled={saving}
                  className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* ── Password form ── */}
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                <KeyRound size={18} className="text-slate-500" /> Change Password
              </h2>
              <form onSubmit={savePassword} className="space-y-4">
                <Field label="Current Password">
                  <Input type="password" value={pwForm.oldPassword}
                    onChange={e => setPwForm(p => ({ ...p, oldPassword: e.target.value }))} autoComplete="current-password" />
                </Field>
                <Field label="New Password">
                  <Input type="password" value={pwForm.newPassword}
                    onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} autoComplete="new-password" />
                </Field>
                <Field label="Confirm New Password">
                  <Input type="password" value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" />
                </Field>
                <button
                  type="submit" disabled={pwSaving}
                  className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <KeyRound size={16} /> {pwSaving ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
