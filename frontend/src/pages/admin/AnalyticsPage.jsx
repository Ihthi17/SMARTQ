import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { AdminLayout } from '../../layouts/AdminLayout';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import ChartSection from '../../components/dashboard/ChartSection';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';

const COLORS = {
  primary: '#0f766e',
  secondary: '#14b8a6',
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  queued: '#8b5cf6',
  completed: '#10b981',
  cancelled: '#ef4444',
  noShow: '#6b7280',
  high: '#dc2626',
  normal: '#10b981',
};

const STATUS_COLORS = {
  pending: COLORS.pending,
  confirmed: COLORS.confirmed,
  queued: COLORS.queued,
  called: '#06b6d4',
  in_service: '#8b5cf6',
  completed: COLORS.completed,
  cancelled: COLORS.cancelled,
  no_show: COLORS.noShow,
  expired: '#6b7280',
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [dateRange, setDateRange] = useState('today');
  const [location, setLocation] = useState('all');

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setLoading(true);
      setErrors({});

      try {
        // Fetch analytics data
        const analyticsRes = await api.get(`/analytics/queue?range=${dateRange}`);
        setAnalytics(analyticsRes.data);
      } catch (err) {
        const errorMsg = err.response?.data?.message || 'Failed to load analytics';
        setErrors(prev => ({ ...prev, analytics: errorMsg }));
        console.error('Analytics fetch error:', err);
        toast.error(errorMsg);
      }

      try {
        // Fetch recent activity
        const activitiesRes = await api.get('/settings/audit?limit=20&sort=-createdAt');
        setActivities(activitiesRes.data.data || []);
      } catch (err) {
        const errorMsg = err.response?.data?.message || 'Failed to load activity feed';
        setErrors(prev => ({ ...prev, activities: errorMsg }));
        console.error('Activities fetch error:', err);
      }

      setLoading(false);
    };

    fetchAnalyticsData();
  }, [dateRange, location]);

  const handleRetry = () => {
    setLoading(true);
  };

  // Helper: Get status breakdown for pie chart
  const getStatusBreakdown = () => {
    if (!analytics?.metrics?.byStatus) return [];
    return [
      { name: 'Completed', value: analytics.metrics.byStatus.completed, color: STATUS_COLORS.completed },
      { name: 'Pending', value: analytics.metrics.byStatus.pending, color: STATUS_COLORS.pending },
      { name: 'Confirmed', value: analytics.metrics.byStatus.confirmed, color: STATUS_COLORS.confirmed },
      { name: 'Queued', value: analytics.metrics.byStatus.queued, color: STATUS_COLORS.queued },
      { name: 'Cancelled', value: analytics.metrics.byStatus.cancelled, color: STATUS_COLORS.cancelled },
      { name: 'No-Show', value: analytics.metrics.byStatus.no_show, color: STATUS_COLORS.noShow },
    ].filter(s => s.value > 0);
  };

  // Helper: Get service distribution for bar chart (top 10)
  const getServiceDistribution = () => {
    if (!analytics?.charts?.serviceDistribution) return [];
    return analytics.charts.serviceDistribution.slice(0, 10).map(s => ({
      name: s.service?.substring(0, 10) || 'N/A',
      count: s.count,
      completed: s.completed,
    }));
  };

  // Helper: Get hourly distribution for peak hours chart
  const getHourlyDistribution = () => {
    if (!analytics?.charts?.hourlyDistribution) return [];
    return analytics.charts.hourlyDistribution.map(h => ({
      hour: h.hour,
      count: h.count,
      completed: h.completed,
    }));
  };

  // Helper: Get daily trend
  const getDailyTrend = () => {
    if (!analytics?.charts?.dailyTrend) return [];
    return analytics.charts.dailyTrend.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      appointments: d.count,
      completed: d.completed,
      avgWait: Math.round(d.avgWaitTime || 0),
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 size={32} className="text-teal-600" /> Queue Analytics
          </h1>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Locations</option>
            </select>
          </div>

          <button
            onClick={handleRetry}
            className="mt-6 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition flex items-center justify-center gap-2"
          >
            <TrendingUp size={16} /> Refresh
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-600">Total Served</p>
            <p className="text-3xl font-bold text-teal-700 mt-2">
              {loading ? '—' : analytics?.metrics?.totalServed || 0}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-600">Avg Wait Time</p>
            <p className="text-3xl font-bold text-blue-700 mt-2">
              {loading ? '—' : `${analytics?.summary?.avgWaitTime ? Math.round(analytics.summary.avgWaitTime) : 0}m`}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-600">Avg Service Time</p>
            <p className="text-3xl font-bold text-purple-700 mt-2">
              {loading ? '—' : `${analytics?.summary?.avgServiceTime ? Math.round(analytics.summary.avgServiceTime) : 0}m`}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-600">Completion Rate</p>
            <p className="text-3xl font-bold text-green-700 mt-2">
              {loading ? '—' : `${analytics?.metrics?.completionRate ? analytics.metrics.completionRate.toFixed(1) : 0}%`}
            </p>
          </div>
        </div>

        {/* Appointment Status Distribution & Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution */}
          <ChartSection
            title="Appointment Status Distribution"
            description="Breakdown of appointments by status"
            loading={loading}
            error={errors.analytics}
            onRetry={handleRetry}
            height="h-80"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={getStatusBreakdown()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name} ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {getStatusBreakdown().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}`} />
              </PieChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Daily Trend */}
          <ChartSection
            title="Appointment Trends"
            description={`Daily trend for the selected period`}
            loading={loading}
            error={errors.analytics}
            onRetry={handleRetry}
            height="h-80"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={getDailyTrend()}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="appointments"
                  stroke={COLORS.primary}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  name="Appointments"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>

        {/* Peak Hours & Service Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Peak Hours Chart */}
          <ChartSection
            title="Peak Hours Analysis"
            description="Appointment distribution by hour of day"
            loading={loading}
            error={errors.analytics}
            onRetry={handleRetry}
            height="h-80"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getHourlyDistribution()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill={COLORS.primary} name="Total Appointments" />
                <Bar dataKey="completed" fill={COLORS.secondary} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Service Distribution */}
          <ChartSection
            title="Queue Load by Service"
            description="Top 10 services by appointment volume"
            loading={loading}
            error={errors.analytics}
            onRetry={handleRetry}
            height="h-80"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={getServiceDistribution()}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill={COLORS.primary} name="Total" />
                <Bar dataKey="completed" fill={COLORS.secondary} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>

        {/* Detailed Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Key Metrics */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Key Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Peak Hour</span>
                <span className="text-lg font-semibold text-teal-700">
                  {analytics?.detailedStats?.peakHour || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">No-Show Rate</span>
                <span className="text-lg font-semibold text-red-700">
                  {analytics?.detailedStats?.noShowRate ? `${analytics.detailedStats.noShowRate.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Max Wait Time</span>
                <span className="text-lg font-semibold text-orange-700">
                  {analytics?.detailedStats?.maxWaitTime ? `${analytics.detailedStats.maxWaitTime}m` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Max Service Time</span>
                <span className="text-lg font-semibold text-purple-700">
                  {analytics?.detailedStats?.maxServiceTime ? `${analytics.detailedStats.maxServiceTime}m` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Service Distribution Stats */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Cancellation & No-Show</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                <span className="text-sm text-red-900">Cancellation Rate</span>
                <span className="text-lg font-semibold text-red-700">
                  {analytics?.metrics?.cancellationRate ? `${analytics.metrics.cancellationRate.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                <span className="text-sm text-orange-900">No-Show Rate</span>
                <span className="text-lg font-semibold text-orange-700">
                  {analytics?.metrics?.noShowRate ? `${analytics.metrics.noShowRate.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm text-green-900">Completion Rate</span>
                <span className="text-lg font-semibold text-green-700">
                  {analytics?.metrics?.completionRate ? `${analytics.metrics.completionRate.toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Source & Priority Breakdown */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Booking Sources</h3>
            <div className="space-y-4">
              {analytics?.charts?.sourceBreakdown?.map((source, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm text-blue-900">{source.name}</span>
                  <span className="text-lg font-semibold text-blue-700">{source.value}</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Priority Breakdown</h4>
                {analytics?.charts?.priorityBreakdown?.map((priority, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm mb-2">
                    <span className="text-slate-600">{priority.name}</span>
                    <span className="font-semibold text-teal-700">{priority.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent System Activity */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 size={20} /> Recent System Activity
          </h3>
          <ActivityFeed
            activities={activities}
            loading={loading}
            error={errors.activities}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
