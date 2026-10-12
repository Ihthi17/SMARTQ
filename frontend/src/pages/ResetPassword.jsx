import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';

export default function ResetPassword() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const token       = params.get('token') || '';
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error('Passwords do not match');
    if (newPassword.length < 8)  return toast.error('Minimum 8 characters');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      toast.success('Password reset! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Reset Password</h2>
        {!token && (
          <p className="text-red-500 text-sm">Invalid or missing reset token.</p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password" value={newPassword} onChange={e => setNew(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button disabled={busy || !token}
            className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {busy ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
