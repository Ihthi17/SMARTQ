import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '../../layouts/AdminLayout';
import api from '../../api/axiosInstance';
import toast, { Toaster } from 'react-hot-toast';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, Clock, TrendingUp, Users, AlertCircle, RefreshCw, Calendar } from 'lucide-react';

const COLORS = ['#0f766e', '#7c3aed', '#0d9488', '#06b6d4', '#f97316', '#ec4899'];

export default function QueueAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('today');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    // Load providers
    api.get('/providers')
      .then(({ data }) => setProviders(data))
      .catch(error => console.error('Could not load providers', error));
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        range: dateRange,
        ...(dateRange === 'custom' && fromDate && { from: fromDate }),
        ...(dateRange === 'custom' && toDate && { to: toDate }),
        ...(selectedProvider !== 'all' && { providerId: selectedProvider }),
      };
      const { data } = await api.get('/analytics/queue', { params });
      setAnalytics(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange, fromDate, toDate, selectedProvider]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-teal-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Loading analytics...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!analytics) {
    return (
      <AdminLayout>
        <div className="rounded-xl bg-amber-50 border border-amber-300 p-6">
          <p className="text-amber-900">No analytics data available for the selected period.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Activity className="text-teal-700" size={28} />
            Queue Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">Track queue performance, wait times, and customer metrics.</p>
        </header>

        {/* Filters */}
        <section className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Date Range
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </label>

            {dateRange === 'custom' && (
              <>
                <label className="text-sm font-medium text-slate-700">
                  From Date
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  To Date
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </>
            )}

            <label className="text-sm font-medium text-slate-700">
              Location
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="all">All Locations</option>
                {providers.map((provider) => (
                  <option key={provider._id} value={provider._id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={loadAnalytics}
              className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 text-white px-4 py-2 font-medium hover:bg-teal-700 self-end"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </section>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Total Served</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{analytics.totalServed || 0}</p>
              </div>
              <Users size={24} className="text-teal-600" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Avg Wait Time</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{Math.round(analytics.avgWaitTime || 0)}m</p>
              </div>
              <Clock size={24} className="text-blue-600" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Avg Service Time</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{Math.round(analytics.avgServiceTime || 0)}m</p>
              </div>
              <TrendingUp size={24} className="text-purple-600" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Completion Rate</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{Math.round(analytics.completionRate || 0)}%</p>
              </div>
              <Activity size={24} className="text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Wait Time Trend */}
          {analytics.waitTimeTrend && analytics.waitTimeTrend.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Wait Time Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.waitTimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="waitTime" stroke="#0f766e" name="Wait Time (min)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Service Duration Trend */}
          {analytics.serviceDurationTrend && analytics.serviceDurationTrend.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Service Duration Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.serviceDurationTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="serviceTime" stroke="#7c3aed" name="Service Time (min)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Status Distribution */}
          {analytics.statusDistribution && analytics.statusDistribution.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Appointment Status Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.statusDistribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {analytics.statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Hourly Distribution */}
          {analytics.hourlyDistribution && analytics.hourlyDistribution.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Appointments by Hour</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.hourlyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#0f766e" name="Appointments" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Service Performance */}
          {analytics.servicePerformance && analytics.servicePerformance.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h3 className="font-semibold text-slate-900 mb-4">Service Performance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.servicePerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="service" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#0f766e" name="Total" />
                  <Bar dataKey="avgWaitTime" fill="#06b6d4" name="Avg Wait (min)" />
                  <Bar dataKey="avgServiceTime" fill="#7c3aed" name="Avg Service (min)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Detailed Statistics */}
        {analytics.detailedStats && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-4">Detailed Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-600">Peak Hour</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {analytics.detailedStats.peakHour || '—'}:00
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-600">No-Show Rate</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Math.round(analytics.detailedStats.noShowRate || 0)}%
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-600">Max Wait Time</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Math.round(analytics.detailedStats.maxWaitTime || 0)}m
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-600">Max Service Time</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Math.round(analytics.detailedStats.maxServiceTime || 0)}m
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
