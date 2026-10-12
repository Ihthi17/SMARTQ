import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import toast, { Toaster } from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { login }     = useContext(AuthContext);
  const navigate      = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', rememberMe: false });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const change = (e) => setForm(f => ({
    ...f,
    [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login(form);
      navigate(user.role === 'staff' ? '/admin/queue' : '/admin');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-1">Smart Queue</p>
          <h1 className="text-2xl font-bold text-slate-800">Sign in to your account</h1>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
            <input
              name="username" type="text" value={form.username} onChange={change} required autoFocus
              placeholder="superadmin"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <div className="relative">
              <input
                name="password" 
                type={showPassword ? "text" : "password"} 
                value={form.password} 
                onChange={change} 
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600">
              <input name="rememberMe" type="checkbox" checked={form.rememberMe} onChange={change}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              Remember me
            </label>
            <Link to="/forgot-password" className="text-teal-600 hover:underline">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit" disabled={busy}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Need a visit? <Link to="/book-appointment" className="font-semibold text-teal-700 hover:underline">Book an appointment</Link>
        </p>
      </div>
    </div>
  );
}
