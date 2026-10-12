import { AdminLayout } from '../../layouts/AdminLayout';
import { LayoutDashboard } from 'lucide-react';

export default function AdminDashboard() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <LayoutDashboard size={26} className="text-teal-600" /> Dashboard
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Users',        value: '—', color: 'bg-teal-50  text-teal-700'  },
            { label: 'Active Queue',        value: '—', color: 'bg-blue-50  text-blue-700'  },
            { label: 'Today Appointments',  value: '—', color: 'bg-purple-50 text-purple-700' },
            // { label: 'Fraud Flags',         value: '—', color: 'bg-red-50   text-red-700'   },
            // { label: 'Feedback Today',      value: '—', color: 'bg-amber-50  text-amber-700' },
            // { label: 'No-Show Rate',        value: '—', color: 'bg-slate-50  text-slate-700' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl p-5 ${c.color} shadow-sm`}>
              <p className="text-sm font-medium opacity-70">{c.label}</p>
              <p className="text-3xl font-bold mt-1">{c.value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">Analytics will populate as data accumulates.</p>
      </div>
    </AdminLayout>
  );
}
