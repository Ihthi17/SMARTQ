import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [sent, setSent]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Forgot Password</h1>
        <p className="text-sm text-slate-500 mb-6">
          Enter your account email. If it exists, we'll send a reset link.
        </p>

        {sent ? (
          <div className="rounded-lg bg-teal-50 border border-teal-200 p-4 text-sm text-teal-700">
            Check your inbox for a password reset link. The link expires in 15 minutes.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="admin@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button disabled={busy}
              className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="text-teal-600 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
