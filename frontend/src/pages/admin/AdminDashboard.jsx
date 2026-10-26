import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Clock, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { AdminLayout } from '../../layouts/AdminLayout';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import SummaryCard from '../../components/dashboard/SummaryCard';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setErrors({});

      try {
        // Fetch summary metrics
        const summaryRes = await api.get('/analytics/dashboard/summary');
        setSummary(summaryRes.data);
      } catch (err) {
        const errorMsg = err.response?.data?.message || 'Failed to load summary';
        setErrors(prev => ({ ...prev, summary: errorMsg }));
        console.error('Summary fetch error:', err);
        toast.error(errorMsg);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const summaryRes = await api.get('/analytics/dashboard/summary');
      setSummary(summaryRes.data);
      toast.success('Dashboard updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard size={32} className="text-teal-600" /> Admin Dashboard
          </h1>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition"
          >
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <SummaryCard
            label="Total Users"
            value={loading ? '—' : summary?.metrics?.totalUsers || 0}
            subtitle={summary?.metrics?.activeRoles && `${summary.metrics.activeRoles.admin || 0} admins, ${summary.metrics.activeRoles.staff || 0} staff`}
            icon={Users}
            color="teal"
            loading={loading}
          />
          <SummaryCard
            label="Active Queue"
            value={loading ? '—' : summary?.metrics?.activeQueueCount || 0}
            subtitle="Customers waiting"
            icon={Clock}
            color="blue"
            loading={loading}
          />
          <SummaryCard
            label="Today's Appointments"
            value={loading ? '—' : summary?.metrics?.todaysAppointments || 0}
            subtitle="Total scheduled"
            icon={TrendingUp}
            color="purple"
            loading={loading}
          />
          <SummaryCard
            label="Completed Today"
            value={loading ? '—' : summary?.metrics?.completedToday || 0}
            subtitle="Successfully served"
            icon={CheckCircle}
            color="green"
            loading={loading}
          />
          <SummaryCard
            label="Cancelled Today"
            value={loading ? '—' : summary?.metrics?.cancelledToday || 0}
            subtitle="Cancellations"
            icon={AlertCircle}
            color="red"
            loading={loading}
          />
          <SummaryCard
            label="Avg Wait Time"
            value={loading ? '—' : `${summary?.metrics?.avgWaitTimeMinutes || 0}m`}
            subtitle="System average"
            icon={TrendingUp}
            color="amber"
            loading={loading}
          />
        </div>

        {/* No-Show & Completion Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            label="No-Shows Today"
            value={loading ? '—' : summary?.metrics?.noShowsToday || 0}
            subtitle="Did not attend"
            icon={AlertCircle}
            color="red"
            loading={loading}
          />
          <SummaryCard
            label="Total Waiting Users"
            value={loading ? '—' : summary?.metrics?.activeQueueCount || 0}
            subtitle="Currently waiting in queue"
            icon={Users}
            color="blue"
            loading={loading}
          />
        </div>

        {/* Info Section */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">📊 Detailed Analytics</h3>
          <p className="text-sm text-blue-800 mb-4">
            For comprehensive appointment analytics, peak hours analysis, queue load by service, and recent system activity, visit the <strong>Analytics</strong> page in the sidebar.
          </p>
          <a
            href="/admin/analytics"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Go to Analytics →
          </a>
        </div>
      </div>
    </AdminLayout>
  );
}
