import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { KeyRound, Eye, EyeOff } from 'lucide-react';

export default function ChangePassword() {
  const { token, setUser, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState({ old: false, new: false, confirm: false });
  const [busy, setBusy] = useState(false);

  const toggle = (field) => setShow(s => ({ ...s, [field]: !s[field] }));
  const change = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();

    if (form.newPassword !== form.confirm)
      return toast.error('New passwords do not match');

    if (form.newPassword.length < 8)
      return toast.error('New password must be at least 8 characters');

    if (form.newPassword === form.oldPassword)
      return toast.error('New password must differ from the current one');

    setBusy(true);
    try {
      // Ensure the Bearer token is on the request even if the useEffect
      // in AuthContext hasn't fired yet (race condition on first render).
      await api.post(
        '/auth/change-password',
        { oldPassword: form.oldPassword, newPassword: form.newPassword },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      toast.success('Password updated! Redirecting to login…');

      // Update mustChangePassword flag locally so ProtectedRoute
      // stops redirecting, then log out to force a clean re-login.
      setUser(u => ({ ...u, mustChangePassword: false }));

      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setBusy(false);
    }
  };

  const PasswordInput = ({ name, label, showKey }) => (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          name={name}
          type={show[showKey] ? 'text' : 'password'}
          value={form[name]}
          onChange={change}
          required
          autoComplete={name === 'oldPassword' ? 'current-password' : 'new-password'}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm
            focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={() => toggle(showKey)}
          className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
        >
          {show[showKey] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-50 mb-4">
            <KeyRound size={26} className="text-teal-600" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-1">
            Smart Queue
          </p>
          <h1 className="text-2xl font-bold text-slate-800">Set a New Password</h1>
          <p className="text-sm text-slate-500 mt-2">
            You must change your password before continuing.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <PasswordInput name="oldPassword"  label="Current Password"  showKey="old" />
          <PasswordInput name="newPassword"  label="New Password"       showKey="new" />
          <PasswordInput name="confirm"      label="Confirm New Password" showKey="confirm" />

          {/* Password rules hint */}
          <ul className="text-xs text-slate-400 space-y-0.5 pl-4 list-disc">
            <li>At least 8 characters</li>
            <li>Must differ from the current password</li>
          </ul>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold
              hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <KeyRound size={16} />
            {busy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
